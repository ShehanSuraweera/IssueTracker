"""Runs the evals against the configured LLM provider and writes a results folder.

    uv run python -m evals.run                         # every suite, new run
    uv run python -m evals.run --suites triage --limit 5
    uv run python -m evals.run --resume evals/results/<run_id>
    uv run python -m evals.run --rescore evals/results/<run_id>   # no model calls

Each prediction is saved as soon as it arrives, so an interrupted run (for
example at the free tier's daily quota) continues with --resume. Results go
to evals/results/<run_id>/: run.json (model, prompts, dataset hashes),
predictions.jsonl, metrics.json and report.md.
"""

import argparse
import asyncio
import hashlib
import json
import subprocess
import sys
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ai_service.config import Settings
from ai_service.embeddings import FastEmbedder
from ai_service.llm.base import (
    LLMBlockedError,
    LLMError,
    LLMInvalidOutputError,
    LLMProvider,
)
from ai_service.llm.factory import build_provider
from ai_service.prompts import analyze as analyze_prompt
from ai_service.prompts import resolution as resolution_prompt
from ai_service.prompts import sentiment as sentiment_prompt
from ai_service.schemas import (
    AnalyzeRequest,
    CallMeta,
    DocumentRequest,
    ProductContext,
    ResolutionRequest,
    SentimentRequest,
)
from ai_service.services.analysis import analyze_comment_sentiment, analyze_issue
from ai_service.services.retrieval import embedding_text, index_document, suggest_resolution
from ai_service.vector_store import InMemoryVectorStore
from evals import datasets
from evals.scoring import (
    Prediction,
    Suite,
    render_report,
    score_injection,
    score_retrieval,
    score_sentiment,
    score_triage,
)

RESULTS_DIR = Path(__file__).parent / "results"
SUITES: tuple[Suite, ...] = ("triage", "sentiment", "retrieval", "injection")
RAW_RESULTS = 10  # retrieval results kept per query, before the threshold
# Rate limits, timeouts and outages say nothing about the model, so they are
# retried. Invalid output is a result and is never retried.
INFRA_RETRY_DELAYS_S = (20, 40, 60, 90)


class Throttle:
    """Keeps LLM calls at most `rpm` per minute."""

    def __init__(self, rpm: float) -> None:
        self._interval = 60 / rpm if rpm > 0 else 0
        self._next = 0.0

    async def wait(self) -> None:
        delay = self._next - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)
        self._next = time.monotonic() + self._interval


class Recorder:
    """Appends predictions to predictions.jsonl and remembers which are done."""

    def __init__(self, run_dir: Path) -> None:
        self.path = run_dir / "predictions.jsonl"
        self.done: dict[tuple[str, str], Prediction] = {}
        if self.path.exists():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    p = Prediction.model_validate_json(line)
                    self.done[(p.suite, p.id)] = p

    def has(self, suite: Suite, case_id: str) -> bool:
        return (suite, case_id) in self.done

    def add(self, prediction: Prediction) -> None:
        self.done[(prediction.suite, prediction.id)] = prediction
        with self.path.open("a", encoding="utf-8", newline="\n") as f:
            f.write(prediction.model_dump_json() + "\n")

    def for_suite(self, suite: Suite) -> dict[str, Prediction]:
        return {case_id: p for (s, case_id), p in self.done.items() if s == suite}


def _meta(meta: CallMeta | None) -> dict[str, Any] | None:
    return meta.model_dump() if meta else None


async def call_llm(
    suite: Suite,
    case_id: str,
    throttle: Throttle,
    call: Callable[[], Awaitable[tuple[dict[str, Any], CallMeta | None]]],
) -> Prediction:
    for attempt, delay in enumerate((*INFRA_RETRY_DELAYS_S, None)):
        await throttle.wait()
        try:
            output, meta = await call()
            return Prediction(suite=suite, id=case_id, status="ok", output=output, meta=_meta(meta))
        except LLMInvalidOutputError as exc:
            return Prediction(
                suite=suite,
                id=case_id,
                status="invalid_output",
                error_code=exc.code,
                detail=exc.detail,
            )
        except LLMBlockedError as exc:
            return Prediction(suite=suite, id=case_id, status="blocked", error_code=exc.code)
        except LLMError as exc:
            if not exc.retryable or delay is None:
                return Prediction(suite=suite, id=case_id, status="error", error_code=exc.code)
            print(f"  {case_id}: {exc.code}, retry {attempt + 1} in {delay}s", flush=True)
            await asyncio.sleep(delay)
    raise AssertionError("unreachable")


# ─── Suites ──────────────────────────────────────────────────────────────────


async def run_triage(
    ctx: "Context", cases: list[datasets.TriageCase], products: dict[str, datasets.Product]
) -> None:
    for case in cases:
        if ctx.recorder.has("triage", case.id):
            continue
        product = products[case.product]
        body = AnalyzeRequest(
            issue_type=case.issue_type,
            title=case.title,
            description=case.description,
            product=ProductContext(name=product.name, description=product.description),
        )

        async def call(body: AnalyzeRequest = body) -> tuple[dict[str, Any], CallMeta | None]:
            response = await analyze_issue(body, provider=ctx.provider, settings=ctx.settings)
            return response.result.model_dump(), response.meta

        ctx.record(await call_llm("triage", case.id, ctx.throttle, call))


async def run_sentiment(ctx: "Context", cases: list[datasets.SentimentCase]) -> None:
    for case in cases:
        if ctx.recorder.has("sentiment", case.id):
            continue
        body = SentimentRequest(comment=case.comment, issue_title=case.issue_title)

        async def call(body: SentimentRequest = body) -> tuple[dict[str, Any], CallMeta | None]:
            response = await analyze_comment_sentiment(
                body, provider=ctx.provider, settings=ctx.settings
            )
            return response.result.model_dump(), response.meta

        ctx.record(await call_llm("sentiment", case.id, ctx.throttle, call))


async def run_retrieval(ctx: "Context", data: datasets.RetrievalSet) -> None:
    """No LLM: embeds the corpus into an in-memory store and searches it."""
    store = InMemoryVectorStore()
    embedder = ctx.embedder()
    for doc in data.corpus:
        await index_document(
            doc.issue_id,
            DocumentRequest(
                company_id=doc.company_id,
                product_id=doc.product_id,
                ticket_number=doc.ticket_number,
                title=doc.title,
                problem=doc.problem,
                resolution=doc.resolution,
            ),
            embedder=embedder,
            store=store,
        )
    for query in data.queries:
        if ctx.recorder.has("retrieval", query.id):
            continue
        [vector] = await embedder.embed([embedding_text(query.title, query.description)])
        hits = await store.search(company_id=query.company_id, embedding=vector, limit=RAW_RESULTS)
        ranked = [
            {"ticket_number": hit.document.ticket_number, "similarity": round(hit.similarity, 4)}
            for hit in hits
        ]
        ctx.record(
            Prediction(suite="retrieval", id=query.id, status="ok", output={"ranked": ranked})
        )


async def run_injection(
    ctx: "Context", cases: list[datasets.InjectionCase], products: dict[str, datasets.Product]
) -> None:
    for index, case in enumerate(cases):
        if ctx.recorder.has("injection", case.id):
            continue
        call: Callable[[], Awaitable[tuple[dict[str, Any], CallMeta | None]]]
        if case.target == "analyze":
            product = products[case.product or ""]
            analyze_body = AnalyzeRequest(
                issue_type=case.issue_type or "bug",
                title=case.title or "",
                description=case.description or "",
                product=ProductContext(name=product.name, description=product.description),
            )

            async def call_analyze(
                body: AnalyzeRequest = analyze_body,
            ) -> tuple[dict[str, Any], CallMeta | None]:
                response = await analyze_issue(body, provider=ctx.provider, settings=ctx.settings)
                return response.result.model_dump(), response.meta

            call = call_analyze
        elif case.target == "sentiment":
            sentiment_body = SentimentRequest(
                comment=case.comment or "", issue_title=case.issue_title or ""
            )

            async def call_sentiment(
                body: SentimentRequest = sentiment_body,
            ) -> tuple[dict[str, Any], CallMeta | None]:
                response = await analyze_comment_sentiment(
                    body, provider=ctx.provider, settings=ctx.settings
                )
                return response.result.model_dump(), response.meta

            call = call_sentiment
        else:
            call = await _resolution_call(ctx, case, company_id=9000 + index)
        ctx.record(await call_llm("injection", case.id, ctx.throttle, call))


async def _resolution_call(
    ctx: "Context", case: datasets.InjectionCase, *, company_id: int
) -> Callable[[], Awaitable[tuple[dict[str, Any], CallMeta | None]]]:
    """Each case gets its own company in a fresh store holding its (poisoned) history."""
    if case.query is None:
        raise ValueError(f"{case.id}: resolution case without a query")
    store = InMemoryVectorStore()
    embedder = ctx.embedder()
    for offset, past in enumerate(case.past_issues, start=1):
        await index_document(
            company_id * 100 + offset,
            DocumentRequest(
                company_id=company_id,
                product_id=1,
                ticket_number=past.ticket_number,
                title=past.title,
                problem=past.problem,
                resolution=past.resolution,
            ),
            embedder=embedder,
            store=store,
        )
    body = ResolutionRequest(
        company_id=company_id,
        issue_type=case.query.issue_type,
        title=case.query.title,
        description=case.query.description,
    )

    async def call() -> tuple[dict[str, Any], CallMeta | None]:
        response = await suggest_resolution(
            body, provider=ctx.provider, embedder=embedder, store=store, settings=ctx.settings
        )
        return response.result.model_dump(), response.meta

    return call


# ─── Orchestration ───────────────────────────────────────────────────────────


class Context:
    def __init__(self, settings: Settings, run_dir: Path, rpm: float) -> None:
        self.settings = settings
        self.recorder = Recorder(run_dir)
        self.throttle = Throttle(rpm)
        self._provider: LLMProvider | None = None
        self._embedder: FastEmbedder | None = None

    @property
    def provider(self) -> LLMProvider:
        # Built on first use, so a retrieval-only run needs no API key
        if self._provider is None:
            self._provider = build_provider(self.settings)
        return self._provider

    async def aclose(self) -> None:
        if self._provider is not None:
            await self._provider.aclose()

    def embedder(self) -> FastEmbedder:
        if self._embedder is None:
            self._embedder = FastEmbedder(
                self.settings.embedding_model, self.settings.embedding_cache_dir
            )
        return self._embedder

    def record(self, prediction: Prediction) -> None:
        self.recorder.add(prediction)
        mark = "." if prediction.status == "ok" else prediction.status[0].upper()
        print(mark, end="", flush=True)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],  # noqa: S607 - git from PATH
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def describe_run(run_id: str, settings: Settings) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "started_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "provider": settings.ai_provider,
        "model": settings.ai_model,
        "thinking_level": settings.llm_thinking_level,
        "temperature": settings.llm_temperature,
        "prompt_versions": {
            "analyze": analyze_prompt.PROMPT_VERSION,
            "sentiment": sentiment_prompt.PROMPT_VERSION,
            "resolution": resolution_prompt.PROMPT_VERSION,
        },
        "embedding_model": settings.embedding_model,
        "min_similarity": settings.retrieval_min_similarity,
        "git_commit": _git_commit(),
        "datasets": {p.name: _sha256(p) for p in sorted(datasets.DATA_DIR.iterdir())},
    }


def score(run_dir: Path, run: dict[str, Any], suites: tuple[Suite, ...]) -> dict[str, Any]:
    recorder = Recorder(run_dir)
    products = datasets.load_products()
    results: dict[str, Any] = {}
    if "triage" in suites and recorder.for_suite("triage"):
        cases = [c for c in datasets.load_triage() if c.id in recorder.for_suite("triage")]
        results["triage"] = score_triage(cases, products, recorder.for_suite("triage"))
    if "sentiment" in suites and recorder.for_suite("sentiment"):
        cases_s = [c for c in datasets.load_sentiment() if c.id in recorder.for_suite("sentiment")]
        results["sentiment"] = score_sentiment(cases_s, recorder.for_suite("sentiment"))
    if "retrieval" in suites and recorder.for_suite("retrieval"):
        results["retrieval"] = score_retrieval(
            datasets.load_retrieval(),
            recorder.for_suite("retrieval"),
            min_similarity=run["min_similarity"],
        )
    if "injection" in suites and recorder.for_suite("injection"):
        cases_i = [c for c in datasets.load_injection() if c.id in recorder.for_suite("injection")]
        results["injection"] = score_injection(cases_i, recorder.for_suite("injection"))
    (run_dir / "metrics.json").write_text(
        json.dumps(results, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    (run_dir / "report.md").write_text(render_report(run, results), encoding="utf-8", newline="\n")
    return results


async def main(argv: list[str] | None = None, settings: Settings | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--suites", default=",".join(SUITES))
    parser.add_argument("--limit", type=int, default=None, help="cases per suite (smoke test)")
    parser.add_argument("--rpm", type=float, default=12, help="max LLM calls per minute")
    parser.add_argument("--results-dir", type=Path, default=RESULTS_DIR)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--resume", type=Path, help="continue an interrupted run")
    group.add_argument("--rescore", type=Path, help="recompute metrics, no model calls")
    args = parser.parse_args(argv)

    suites = tuple(s for s in args.suites.split(",") if s)
    unknown = set(suites) - set(SUITES)
    if unknown:
        parser.error(f"unknown suites: {', '.join(sorted(unknown))}")
    typed_suites: tuple[Suite, ...] = tuple(s for s in SUITES if s in suites)

    if args.rescore:
        run = json.loads((args.rescore / "run.json").read_text(encoding="utf-8"))
        score(args.rescore, run, typed_suites)
        print(f"Rescored {args.rescore / 'report.md'}")
        return 0

    settings = settings or Settings()
    if args.resume:
        run_dir = args.resume
        run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
        if run["model"] != settings.ai_model or run["provider"] != settings.ai_provider:
            parser.error("resume with the same provider and model as the original run")
    else:
        run_id = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        run_dir = args.results_dir / run_id
        run_dir.mkdir(parents=True)
        run = describe_run(run_id, settings)
        (run_dir / "run.json").write_text(
            json.dumps(run, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
    if settings.ai_provider == "fake":
        print("Warning: AI_PROVIDER=fake. The numbers measure the fake, not a model.")

    ctx = Context(settings, run_dir, args.rpm)
    products = datasets.load_products()

    def limited[T](rows: list[T]) -> list[T]:
        return rows[: args.limit] if args.limit else rows

    try:
        for suite in typed_suites:
            print(f"\n{suite}: ", end="", flush=True)
            if suite == "triage":
                await run_triage(ctx, limited(datasets.load_triage()), products)
            elif suite == "sentiment":
                await run_sentiment(ctx, limited(datasets.load_sentiment()))
            elif suite == "retrieval":
                await run_retrieval(ctx, datasets.load_retrieval())
            else:
                await run_injection(ctx, limited(datasets.load_injection()), products)
    finally:
        await ctx.aclose()

    score(run_dir, run, typed_suites)
    print(f"\n\nReport: {run_dir / 'report.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
