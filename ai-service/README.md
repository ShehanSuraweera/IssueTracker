# NewnopDesk — AI Service

Python service that adds AI-assisted triage and sentiment analysis to NewnopDesk. The Node backend calls it over internal HTTP; browsers never reach it.

**Stack:** Python 3.12 · FastAPI · Pydantic · Google Gemini (`google-genai` SDK) · PostgreSQL + pgvector · fastembed · Alembic · uv · pytest · ruff · mypy (strict)

---

## What it does

| Endpoint | Purpose | One LLM call returns |
|----------|---------|----------------------|
| `POST /v1/analyze` | A newly created issue | Triage suggestions (impact, urgency, category, owning team, each with a reason) **and** a sentiment assessment |
| `POST /v1/sentiment` | One client comment on an existing issue | A sentiment assessment, so mood can be tracked across a thread |
| `PUT /v1/documents/{issue_id}` | A resolved issue to index | — (embeds the problem text; re-embeds only when it changed) |
| `DELETE /v1/documents/{issue_id}?company_id=` | Remove an issue from the index (e.g. reopened) | — |
| `GET /v1/documents` | Which issues are indexed, for reconciliation | — |
| `POST /v1/similar` | An issue being viewed | — (vector search: same company, optionally the viewer's products) |
| `POST /v1/suggest-resolution` | An issue being viewed | A suggested fix grounded in similar past issues, citing their ticket numbers |
| `POST /v1/summarize-thread` | An issue and its comments | A summary, key points that each cite the comments (or the description) they come from, and open questions |
| `GET /healthz` | Liveness check, and whether retrieval is enabled | — |

Triage and sentiment share one call per issue to keep cost down. Every result is a **suggestion**: the backend stores it and an engineer or admin accepts, edits or rejects it. This service never changes an issue.

Sentiment is a separate signal for account managers. The prompt tells the model to judge triage from the problem described, never from the client's tone, and the backend never feeds sentiment into the ITIL priority.

---

## Running locally

```bash
cd ai-service
uv sync                         # creates .venv with Python 3.12 and all dependencies
cp .env.example .env            # set AI_SERVICE_TOKEN; add GEMINI_API_KEY, or use AI_PROVIDER=fake

# Retrieval only: one-time database setup, against the Postgres from docker-compose.yml
uv run ai-db bootstrap --admin-url postgresql://newnopdesk:newnopdesk_local@127.0.0.1:5432/newnopdesk
uv run ai-db migrate

uv run ai-serve                 # http://127.0.0.1:8000
```

`ai-serve` starts uvicorn on a selector-based event loop. psycopg's async mode can't run on the `ProactorEventLoop` that uvicorn picks on Windows by default; on Linux the selector loop is standard, so behaviour is identical everywhere.

If `AI_DATABASE_URL` is unset, or the database or embedding model can't be loaded at startup, retrieval is disabled (its endpoints return `503 RETRIEVAL_UNAVAILABLE`) and triage and sentiment keep working. `/healthz` reports which.

With `AI_PROVIDER=fake` the service runs without an API key. The fake provider uses keyword rules: its output is valid but not accurate, which is enough to develop and demo the rest of the system.

```bash
curl -X POST http://127.0.0.1:8000/v1/analyze \
  -H "Authorization: Bearer $AI_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"issue_type":"bug","title":"Push notifications missing on iOS 17",
       "description":"Tenants on iOS 17 no longer receive rent reminders.",
       "product":{"name":"Apartment LK Mobile"}}'
```

Configuration is documented in [.env.example](.env.example). The service validates it at startup and refuses to start if, for example, the token is shorter than 32 characters or `GEMINI_API_KEY` is missing.

---

## API contract

All `/v1` endpoints need `Authorization: Bearer <AI_SERVICE_TOKEN>`. An `X-Request-ID` header is reused for logging and echoed back, so one ID can follow a request from the browser through Node into this service.

**Success:**

```json
{
  "result": {
    "triage": {
      "impact": "high", "impact_reason": "...",
      "urgency": "medium", "urgency_reason": "...",
      "category": "notifications", "category_reason": "...",
      "team": "mobile", "team_reason": "..."
    },
    "sentiment": {
      "sentiment": "negative", "frustration_level": 3, "escalation_risk": "medium",
      "evidence_quote": "really frustrating for our tenants", "reason": "..."
    },
    "manipulation_attempt": false
  },
  "meta": {
    "provider": "gemini", "model": "gemini-3.5-flash-lite", "prompt_version": "analyze-v1",
    "latency_ms": 840, "input_tokens": 1210, "output_tokens": 180, "thinking_tokens": 0
  }
}
```

**Errors** share one envelope. `retryable` tells the caller whether trying again might help; `meta` is included when a model call happened, because failed calls can still cost tokens.

```json
{ "error": { "code": "LLM_INVALID_OUTPUT", "message": "...", "retryable": true, "detail": "quote_not_verbatim" },
  "meta": { "...": "..." } }
```

| Code | HTTP | Retryable | Meaning |
|------|------|-----------|---------|
| `UNAUTHORIZED` | 401 | no | Missing or wrong service token |
| `VALIDATION_FAILED` | 422 | no | Bad request body (the response lists fields, never values) |
| `LLM_INVALID_OUTPUT` | 502 | yes | The model answered but the answer failed validation and was discarded |
| `LLM_TIMEOUT` | 504 | yes | No answer within `LLM_TIMEOUT_SECONDS` |
| `LLM_RATE_LIMITED` | 503 | yes | Provider quota or rate limit (free tier limits are per Google Cloud project) |
| `LLM_UNAVAILABLE` | 503 | yes | Provider error or unreachable |
| `LLM_BLOCKED` | 422 | no | Provider safety filters refused |
| `LLM_REQUEST_REJECTED` | 502 | no | Provider rejected the request (bad key, unknown model) |
| `RETRIEVAL_UNAVAILABLE` | 503 | no | Retrieval isn't configured, or failed to start |
| `RETRIEVAL_DATABASE_UNAVAILABLE` | 503 | yes | The vector database is unreachable |
| `INTERNAL_ERROR` | 500 | yes | Unexpected error; possibly transient, so the caller may retry within its attempt limit |

The service makes **exactly one attempt** per request. Retrying is the Node backend's decision: its job queue owns the retry budget, so retries never stack up across two layers.

---

## Code layout

```
src/ai_service/
├── main.py              # app factory: create_app(settings, provider)
├── config.py            # Settings, validated at startup
├── schemas.py           # API request/response and strict LLM output models
├── taxonomy.py          # categories and teams, with the descriptions shown to the model
├── safety.py            # cleaning, delimiting and quote checks for untrusted text
├── embeddings.py        # Embedder interface: fastembed (local ONNX) and a fake for tests
├── vector_store.py      # VectorStore interface: PostgreSQL + pgvector, and in-memory
├── serve.py             # `ai-serve`: uvicorn on a selector event loop
├── db/                  # `ai-db`: bootstrap (role + schema) and migrations
├── prompts/             # versioned prompts (analyze-v1, sentiment-v1, resolution-v1, summary-v1)
├── services/
│   ├── llm_call.py      # one call → validate → feature check → log, shared by every feature
│   ├── analysis.py      # triage + sentiment, comment sentiment
│   ├── retrieval.py     # indexing, similar issues, suggested resolutions
│   └── summary.py       # thread summaries
├── llm/
│   ├── base.py          # LLMProvider interface and error types
│   ├── gemini.py        # Gemini implementation
│   ├── fake.py          # keyword-based stand-in for local development
│   ├── factory.py       # picks the provider from AI_PROVIDER
│   └── schema_export.py # Pydantic → the JSON Schema subset providers accept
└── api/                 # routes, auth, error handlers, request-ID middleware
```

Migrations for the `ai` schema live in `migrations/` (Alembic, plain SQL). The labelled evaluation suite lives in [`evals/`](evals/README.md).

**Swapping providers:** the rest of the service depends only on `llm/base.py`. A new provider is one class implementing `generate_json()` that maps its failures to the `LLMError` types, plus one line in `factory.py`.

---

## Safety measures

Client-written text is treated as untrusted at every step.

1. **Instructions and data are separated.** The system prompt is a fixed constant; client text only ever appears in the user message. The prompt's security rules tell the model to treat client data as data, ignore instructions inside it, and report attempts in `manipulation_attempt`.
2. **Unescapable delimiters.** Client text is wrapped in `<client_data-{boundary}>` tags with a random boundary per request. A client can't close the block early because they can't know the boundary, and anything resembling the tag in their text is replaced with `[tag removed]`.
3. **Input cleaning.** Control characters are stripped and text is capped at `MAX_INPUT_CHARS` before it reaches the model.
4. **Constrained output.** The model is given a JSON Schema, so it can't reply with free text. No tools are passed and the SDK's automatic function calling is explicitly disabled, so a model can never trigger code execution.
5. **Strict validation.** Every response is parsed against a strict Pydantic model: unknown fields, out-of-range values, wrong types and over-long strings are rejected, never repaired.
6. **Verbatim evidence.** `evidence_quote` must appear in the client's text (allowing only case, whitespace and quote-style differences). A model that has been manipulated into inventing evidence fails this check mechanically.
7. **Human in the loop.** Even a manipulated answer that passes every check is only a suggestion an engineer reviews.
8. **Privacy in logs.** One JSON log line per LLM call records model, prompt version, latency, token counts and outcome. Client text is never logged; only its length.

Regex blocklists of "bad phrases" are deliberately not used: they are easy to evade and give a false sense of security. The defences above don't depend on spotting the attack.

### Retrieval and tenant isolation

Similar-issue search must never cross a tenant boundary, so isolation is enforced at four independent layers:

1. **The database role.** The service connects as `ai_service`, which owns the `ai` schema (its tables and the pgvector extension) and has **no privileges** on the application's `public` schema. PostgreSQL itself refuses to let it read `users`, `issues` or anything else; a test proves it.
2. **The SQL.** Every search, read and delete filters on `company_id` in the query. The `VectorStore` interface has no unscoped method, `company_id` is a required keyword argument, and invalid values (`0`, negative, `True`, strings) raise.
3. **The viewer's products.** The backend passes the products the viewer can open, so an engineer is never shown (or given a fix based on) an issue from a product outside their access, even within the same company.
4. **The backend re-checks results.** Every returned issue is checked again against the viewer's normal tenancy rules before it reaches a browser, which also drops issues reopened or deleted since they were indexed.

Suggested resolutions are grounded and checked: the model sees only the retrieved past issues (wrapped in `<past_issue-{boundary}>` delimiters with the same neutralisation as client text), must cite at least one of them when it claims relevant history, and **may only cite tickets that were actually retrieved**. A response citing anything else, including a real ticket from another company, is rejected. When no similar issue clears the threshold, no LLM call is made at all.

### Thread summaries

Each comment is wrapped in a `<thread_comment-{boundary}>` delimiter whose attributes (id, author role, internal flag, time) come from the backend's data, never from the text, so a client can't pose as staff. Every key point must cite the comments it comes from (`0` means the issue description), and a citation of anything not in the thread is rejected. Long threads keep their 40 most recent comments, each capped at 1,500 characters, and the prompt says how many older ones were left out.

**Gemini safety filters** are set to block only high-probability harm. Client complaints are often angry or rude, and the default thresholds could block a legitimate complaint we need to classify. The output is constrained JSON, so this doesn't let the model write harmful free text.

**Data:** on Gemini's free tier, Google may use prompts and responses to improve its products. That's acceptable for seeded demo data; a deployment handling real client tickets should use a paid tier.

---

## Testing

```bash
uv run pytest             # 266 tests; database tests start a throwaway pgvector container (Docker)
uv run ruff check .       # lint (includes security rules)
uv run ruff format .      # format
uv run mypy               # strict type checking of src/, tests/ and evals/
uv run pytest -m live -v  # optional: 3 smoke tests against the real Gemini API (needs GEMINI_API_KEY)
uv run pytest -m embedding  # optional: the real embedding model (downloads ~67 MB once)
```

Tests use a **scripted provider** that returns whatever output a test specifies, valid or malicious, and records every prompt it receives.

| File | What it proves |
|------|----------------|
| `test_prompt_injection.py` | Client text can never change the system prompt or escape its delimited block; forged tags and control characters are neutralised; long input is truncated; output from a manipulated model is rejected; error responses and logs never contain client text |
| `test_output_validation.py` | 21 kinds of malformed output are rejected, and faithful quotes are still accepted |
| `test_llm_errors.py` | Each provider failure maps to the right status and retry hint; unexpected errors don't leak details |
| `test_api.py` | Service-token auth, request validation, request IDs, response shape |
| `test_gemini_provider.py` | Request building (schema, safety settings, thinking level) and mapping of Gemini responses and errors, against a stubbed SDK |
| `test_safety.py` | Input cleaning and quote matching |
| `test_schema_and_prompts.py` | Taxonomy, schemas, provider schemas and prompts agree with each other |
| `test_vector_store.py` | One contract run against **both** stores (in-memory and PostgreSQL): ranking, company isolation, product narrowing, scoped delete, invalid company IDs |
| `test_database_security.py` | Against real PostgreSQL: `ai_service` can't read, write or create anything in `public`; the extension lives in `ai`; `company_id > 0` is enforced by a `CHECK` |
| `test_retrieval_api.py` | Indexing and re-embedding, disjoint results per company, product narrowing, citations limited to retrieved tickets, injected past-issue text staying in its block, retrieval disabled gracefully |
| `test_summary_api.py` | Key points may only cite comments in the thread (or the description); trimmed comments can't be cited; forged comment tags are neutralised; comments ordered by time; long threads trimmed to the most recent |
| `test_retrieval_postgres.py` | Full stack: HTTP → service → PostgreSQL + pgvector, isolated per company |
| `test_live_gemini.py` | Opt-in smoke tests against the real API |
| `test_evals.py` | The eval data is well formed (labels the model can produce, full label coverage, retrieval labels within one company), the metrics match worked examples, and a run works end to end offline, including resume and rescore |

Each safety and isolation defence was checked by disabling it and confirming tests fail.

---

## Design decisions

**Embed the problem, not the fix.** The vector is built from the issue's title and description, so a new issue matches past ones by symptom. The staff resolution notes are stored next to it and given to the model when suggesting a fix, but not embedded: mixing the fix into the vector would blur matching by symptom.

**pgvector in the same PostgreSQL as the application,** in its own schema and role, rather than a separate vector database: no extra server, backups or sync on a 1 GB instance. Prisma only manages `public` and ignores the `ai` schema entirely (verified: its schema diff stays empty).

**Exact search at this scale.** With 300 documents across 3 companies, `EXPLAIN ANALYZE` shows PostgreSQL filtering to the company's rows and taking the top 5 with an exact heap sort in **0.18 ms**, without using the HNSW index. That's faster than the index at this size and exact, so recall measures the embedding model, not index error. The HNSW index is there for when the corpus grows.

**Local embeddings (fastembed, `bge-small-en-v1.5`).** No API key, no per-call cost, and fully reproducible evaluations. 5 ms per embedding, about 200 MB of memory. On real issue text it scored the same problem at 0.86–0.91 and unrelated issues around 0.56–0.63, which is where the 0.70 threshold comes from.

**Short connect timeouts and `127.0.0.1`.** The PostgreSQL client library tries IPv6 first when given `localhost`; with Docker listening only on IPv4, a connection with no timeout waited indefinitely. Every connection now has a 10-second timeout, and local URLs use `127.0.0.1`.

What a real model *does* with malicious input, and how accurate triage, sentiment and retrieval are, is measured by the [evaluation suite](evals/README.md) against a real model, not asserted in unit tests.
