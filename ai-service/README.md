# NewnopDesk — AI Service

Python service that adds AI-assisted triage and sentiment analysis to NewnopDesk. The Node backend calls it over internal HTTP; browsers never reach it.

**Stack:** Python 3.12 · FastAPI · Pydantic · Google Gemini (`google-genai` SDK) · uv · pytest · ruff · mypy (strict)

---

## What it does

| Endpoint | Purpose | One LLM call returns |
|----------|---------|----------------------|
| `POST /v1/analyze` | A newly created issue | Triage suggestions (impact, urgency, category, owning team, each with a reason) **and** a sentiment assessment |
| `POST /v1/sentiment` | One client comment on an existing issue | A sentiment assessment, so mood can be tracked across a thread |
| `GET /healthz` | Liveness check | — |

Triage and sentiment share one call per issue to keep cost down. Every result is a **suggestion**: the backend stores it and an engineer or admin accepts, edits or rejects it. This service never changes an issue.

Sentiment is a separate signal for account managers. The prompt tells the model to judge triage from the problem described, never from the client's tone, and the backend never feeds sentiment into the ITIL priority.

---

## Running locally

```bash
cd ai-service
uv sync                         # creates .venv with Python 3.12 and all dependencies
cp .env.example .env            # set AI_SERVICE_TOKEN; add GEMINI_API_KEY, or use AI_PROVIDER=fake
uv run uvicorn ai_service.main:create_app --factory --host 127.0.0.1 --port 8000
```

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
├── prompts/             # versioned prompts (analyze-v1, sentiment-v1)
├── services/analysis.py # one call → validate → check quote → log
├── llm/
│   ├── base.py          # LLMProvider interface and error types
│   ├── gemini.py        # Gemini implementation
│   ├── fake.py          # keyword-based stand-in for local development
│   ├── factory.py       # picks the provider from AI_PROVIDER
│   └── schema_export.py # Pydantic → the JSON Schema subset providers accept
└── api/                 # routes, auth, error handlers, request-ID middleware
```

**Swapping providers:** the rest of the service depends only on `llm/base.py`. A new provider is one class implementing `generate_json()` that maps its failures to the `LLMError` types, plus one line in `factory.py`.

---

## Safety measures

Client-written text is treated as untrusted at every step.

1. **Instructions and data are separated.** The system prompt is a fixed constant; client text only ever appears in the user message. The prompt's security rules tell the model to treat client data as data, ignore instructions inside it, and report attempts in `manipulation_attempt`.
2. **Unescapable delimiters.** Client text is wrapped in `<client_data-{boundary}>` tags with a random boundary per request. A client can't close the block early because they can't know the boundary, and anything resembling the tag in their text is replaced with `[tag removed]`.
3. **Input cleaning.** Control characters are stripped and text is capped at `MAX_INPUT_CHARS` before it reaches the model.
4. **Constrained output.** The model is given a JSON Schema, so it can't reply with free text.
5. **Strict validation.** Every response is parsed against a strict Pydantic model: unknown fields, out-of-range values, wrong types and over-long strings are rejected, never repaired.
6. **Verbatim evidence.** `evidence_quote` must appear in the client's text (allowing only case, whitespace and quote-style differences). A model that has been manipulated into inventing evidence fails this check mechanically.
7. **Human in the loop.** Even a manipulated answer that passes every check is only a suggestion an engineer reviews.
8. **Privacy in logs.** One JSON log line per LLM call records model, prompt version, latency, token counts and outcome. Client text is never logged; only its length.

Regex blocklists of "bad phrases" are deliberately not used: they are easy to evade and give a false sense of security. The defences above don't depend on spotting the attack.

**Gemini safety filters** are set to block only high-probability harm. Client complaints are often angry or rude, and the default thresholds could block a legitimate complaint we need to classify. The output is constrained JSON, so this doesn't let the model write harmful free text.

**Data:** on Gemini's free tier, Google may use prompts and responses to improve its products. That's acceptable for seeded demo data; a deployment handling real client tickets should use a paid tier.

---

## Testing

```bash
uv run pytest             # 156 tests, no API key or network needed
uv run ruff check .       # lint (includes security rules)
uv run ruff format .      # format
uv run mypy               # strict type checking of src/ and tests/
uv run pytest -m live -v  # optional: 3 smoke tests against the real Gemini API (needs GEMINI_API_KEY)
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
| `test_live_gemini.py` | Opt-in smoke tests against the real API |

Each safety defence was checked by disabling it and confirming tests fail (between 2 and 8 tests per defence).

What a real model *does* with malicious input is measured by the evaluation suite (later phase), not asserted in unit tests.
