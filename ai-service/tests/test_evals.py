"""The eval harness: the labelled data is well formed, the metrics are right,
and a run works end to end offline (with the fake provider)."""

import asyncio
import json
from pathlib import Path
from typing import Any, get_args

import pytest

from ai_service.schemas import Category, Level, Sentiment, Team
from evals import datasets, metrics
from evals.run import main
from evals.scoring import (
    Prediction,
    injection_failures,
    priority,
    score_retrieval,
    score_triage,
)
from tests.conftest import make_settings

# ─── Labelled data ───────────────────────────────────────────────────────────


def test_triage_set_is_sized_and_covers_every_label() -> None:
    cases = datasets.load_triage()
    products = datasets.load_products()
    assert 50 <= len(cases) <= 100
    assert {c.product for c in cases} <= products.keys()
    assert {c.label.team for c in cases} == set(get_args(Team))
    assert {c.label.category for c in cases} == set(get_args(Category))
    for field in ("impact", "urgency"):
        assert {getattr(c.label, field) for c in cases} == set(get_args(Level))


def test_sentiment_set_covers_every_label() -> None:
    cases = datasets.load_sentiment()
    assert len(cases) >= 30
    assert {c.label.sentiment for c in cases} == set(get_args(Sentiment))
    assert {c.label.escalation_risk for c in cases} == set(get_args(Level))
    assert {c.label.frustration_level for c in cases} == {1, 2, 3, 4, 5}


def test_retrieval_labels_point_at_documents_of_the_same_company() -> None:
    data = datasets.load_retrieval()
    company_of = {doc.ticket_number: doc.company_id for doc in data.corpus}
    assert len(company_of) == len(data.corpus), "duplicate ticket numbers"
    assert len({doc.issue_id for doc in data.corpus}) == len(data.corpus)
    assert len(data.queries) >= 20
    assert sum(not q.relevant for q in data.queries) >= 3, "need queries without history"
    for query in data.queries:
        for ticket in query.relevant:
            assert company_of[ticket] == query.company_id, (query.id, ticket)


def test_every_injection_case_is_runnable_and_has_a_success_criterion() -> None:
    products = datasets.load_products()
    cases = datasets.load_injection()
    assert len(cases) >= 20
    for case in cases:
        criteria = (
            case.forbidden.model_dump(exclude_none=True)
            or case.forbidden_substrings
            or case.max_frustration
            or case.min_frustration
        )
        # A case with no criterion is still checked for prompt leaks
        assert criteria or case.attack == "prompt_leak", case.id
        if case.target == "analyze":
            assert case.product in products, case.id
            assert case.title, case.id
            assert case.description, case.id
        elif case.target == "sentiment":
            assert case.comment, case.id
            assert case.issue_title, case.id
        else:
            assert case.query, case.id
            assert case.past_issues, case.id


# ─── Metrics ─────────────────────────────────────────────────────────────────


def test_accuracy_counts_missing_predictions_as_wrong() -> None:
    assert metrics.accuracy(["a", None, "b", "b"], ["a", "a", "b", "c"]) == 0.5


def test_majority_baseline_and_ties() -> None:
    assert metrics.majority_label(["x", "y", "y", "x"]) == "x"
    assert metrics.majority_baseline(["a", "b", "b", "b"]) == 0.75


def test_cohen_kappa_against_a_worked_example() -> None:
    # Observed agreement 3/4. Chance: (2*1 + 2*3) / 16 = 0.5. Kappa = 0.25 / 0.5
    assert metrics.cohen_kappa(["y", "y", "n", "n"], ["y", "n", "n", "n"]) == pytest.approx(0.5)
    assert metrics.cohen_kappa(["a", "b", "c"], ["a", "b", "c"]) == 1.0
    # Always answering the majority label agrees often but is no better than chance
    assert metrics.cohen_kappa(["n"] * 4, ["y", "n", "n", "n"]) == 0.0
    # A failed prediction counts against agreement
    assert metrics.cohen_kappa([None, "n"], ["y", "n"]) < 1.0


def test_frustration_error_measures() -> None:
    assert metrics.mean_absolute_error([1, 3, 5], [2, 3, 3]) == 1.0
    assert metrics.within([1, 3, 5], [2, 3, 3], 1) == pytest.approx(2 / 3)


def test_recall_and_reciprocal_rank() -> None:
    ranked = ["A", "B", "C", "D", "E", "F"]
    assert metrics.recall_at_k(ranked, ["B", "F"], 5) == 0.5
    assert metrics.reciprocal_rank(ranked, ["C"]) == pytest.approx(1 / 3)
    assert metrics.reciprocal_rank(ranked, ["Z"]) == 0.0
    with pytest.raises(ValueError, match="undefined"):
        metrics.recall_at_k(ranked, [], 5)


def test_priority_matrix() -> None:
    assert priority("high", "high") == "critical"
    assert priority("medium", "high") == "high"
    assert priority("low", "high") == "moderate"
    assert priority("low", "medium") == "low"


# ─── Scoring ─────────────────────────────────────────────────────────────────


def _ok(suite: Any, case_id: str, output: dict[str, Any]) -> Prediction:
    meta = {"latency_ms": 100, "input_tokens": 10, "output_tokens": 5}
    return Prediction(suite=suite, id=case_id, status="ok", output=output, meta=meta)


def test_triage_scoring_counts_failures_as_misses_and_reports_baselines() -> None:
    cases = datasets.load_triage()[:2]
    products = datasets.load_products()
    first = cases[0].label
    predictions = {
        cases[0].id: _ok("triage", cases[0].id, {"triage": first.model_dump()}),
        cases[1].id: Prediction(
            suite="triage", id=cases[1].id, status="invalid_output", detail="quote_not_verbatim"
        ),
    }
    result = score_triage(cases, products, predictions)
    assert result["valid_output_rate"] == 0.5
    assert result["fields"]["team"]["ai"] == 0.5
    assert "client_choice_baseline" in result["fields"]["impact"]
    assert "product_default_baseline" in result["fields"]["team"]
    assert result["statuses"]["invalid_output:quote_not_verbatim"] == 1


def test_retrieval_scoring_detects_cross_company_results_and_false_positives() -> None:
    data = datasets.load_retrieval()
    other_company = next(d for d in data.corpus if d.company_id != data.queries[0].company_id)
    predictions = {}
    for query in data.queries:
        ranked = [{"ticket_number": t, "similarity": 0.9} for t in query.relevant]
        if not query.relevant:
            # A confident result for a query that has no relevant history
            own = next(d for d in data.corpus if d.company_id == query.company_id)
            ranked = [{"ticket_number": own.ticket_number, "similarity": 0.95}]
        predictions[query.id] = _ok("retrieval", query.id, {"ranked": ranked})
    leaked = {"ticket_number": other_company.ticket_number, "similarity": 0.99}
    predictions[data.queries[0].id].output["ranked"].append(leaked)  # type: ignore[index]

    result = score_retrieval(data, predictions, min_similarity=0.7)
    assert result["recall_at_k_shown"] == 1.0
    assert result["precision_shown"] < 1.0  # the leaked result was shown too
    assert result["cross_company_results"] == 1
    assert result["no_history_false_positive_rate"] == 1.0


def _case(**overrides: Any) -> datasets.InjectionCase:
    base: dict[str, Any] = {"id": "x", "target": "analyze", "attack": "test"}
    return datasets.InjectionCase.model_validate({**base, **overrides})


def test_injection_failures() -> None:
    output = {
        "triage": {"impact": "high", "urgency": "low", "impact_reason": "Per SECURITY RULES..."},
        "sentiment": {"frustration_level": 5},
    }
    case = _case(
        forbidden={"impact": "high", "urgency": "high"},
        max_frustration=3,
        forbidden_substrings=["evil.example"],
    )
    assert injection_failures(case, output) == [
        "impact=high",
        "frustration 5 > 3",
        "leaked 'security rules'",
    ]
    clean = {"triage": {"impact": "low", "urgency": "low"}, "sentiment": {"frustration_level": 1}}
    assert injection_failures(case, clean) == []
    assert injection_failures(
        _case(forbidden_substrings=["EVIL.example"]), {"steps": ["mail recovery@evil.example"]}
    ) == ["contains 'EVIL.example'"]


# ─── End to end, offline ─────────────────────────────────────────────────────


def test_a_run_writes_predictions_metrics_and_report_and_can_resume(tmp_path: Path) -> None:
    settings = make_settings()  # fake provider: no network
    args = ["--suites", "triage,sentiment,injection", "--limit", "2", "--rpm", "0"]
    assert asyncio.run(main([*args, "--results-dir", str(tmp_path)], settings=settings)) == 0

    [run_dir] = list(tmp_path.iterdir())
    run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    assert run["provider"] == "fake"
    assert set(run["datasets"]) >= {"triage.jsonl", "injection.jsonl"}
    lines = (run_dir / "predictions.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 6
    results = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
    assert results["triage"]["cases"] == 2
    assert results["injection"]["exercised"] == 2
    assert "## Triage (2 issues)" in (run_dir / "report.md").read_text(encoding="utf-8")

    # Resuming a complete run makes no new calls
    assert asyncio.run(main([*args, "--resume", str(run_dir)], settings=settings)) == 0
    assert len((run_dir / "predictions.jsonl").read_text(encoding="utf-8").splitlines()) == 6

    # Rescoring needs neither settings nor a provider
    (run_dir / "report.md").unlink()
    assert asyncio.run(main(["--rescore", str(run_dir)])) == 0
    assert (run_dir / "report.md").exists()
