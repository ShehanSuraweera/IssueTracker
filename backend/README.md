# NewnopDesk — Backend

Express + TypeScript REST API powering the NewnopDesk issue portal. Serves all data to the React frontend and enforces multi-tenant access control at the middleware layer.

---

## Table of Contents

- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Authentication](#authentication)
- [Testing](#testing)
- [Scripts](#scripts)

---

## Local Development

### Prerequisites

- Node.js 24 LTS
- Docker (runs PostgreSQL locally and powers the integration tests)

### Setup

```bash
docker compose up -d db       # from the repo root: PostgreSQL 17 + pgvector on localhost:5432
cd backend
cp .env.example .env          # DATABASE_URL already matches the local database
npm install
npm run keys:generate         # generates RSA key pair in keys/
npx prisma migrate dev        # applies migrations and runs seed automatically
npm run dev                   # starts the dev server with hot reload
```

The database runs in Docker with its data in a named volume, so it survives restarts. `docker compose down -v` deletes it.

API runs at **http://localhost:4000**

Interactive API docs (Swagger UI) available at **http://localhost:4000/api-docs**

---

## Environment Variables

All variables are validated at startup via Zod. The server exits immediately if a required value is missing.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/newnopdesk`. Production on RDS also needs `?sslmode=verify-full&sslrootcert=<CA bundle path>`; see [deployment guide §5](../docs/deployment.md#5-database--rds-postgresql). |
| `PORT` | No | `4000` | HTTP port the Express server binds to |
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `JWT_PRIVATE_KEY_PATH` | No | `./keys/private.pem` | Path to RSA private key (PEM format) |
| `JWT_PUBLIC_KEY_PATH` | No | `./keys/public.pem` | Path to RSA public key (PEM format) |
| `ACCESS_TOKEN_TTL_SECONDS` | No | `900` | Access token lifetime (15 minutes) |
| `REFRESH_TOKEN_TTL_DAYS` | No | `7` | Refresh token lifetime |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin — must match the frontend URL exactly |
| `AWS_REGION` | No | — | AWS region for S3 attachments (e.g. `ap-south-1`) |
| `AWS_BUCKET_ATTACHMENTS` | No | — | S3 bucket name for file attachments |
| `AWS_ACCESS_KEY_ID` | No | — | AWS credentials for S3 presign operations |
| `AWS_SECRET_ACCESS_KEY` | No | — | AWS credentials for S3 presign operations |
| `SMTP_HOST` | No | — | SMTP server hostname (email notifications — not yet active) |
| `SMTP_PORT` | No | — | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASSWORD` | No | — | SMTP password |
| `SMTP_FROM` | No | — | Sender address |
| `AI_ENABLED` | No | `false` | Master switch for the AI layer. Accepts `true`/`false`. When off, the app behaves exactly as it did without AI. |
| `AI_SERVICE_URL` | No | `http://127.0.0.1:8000` | Internal URL of the Python AI service |
| `AI_SERVICE_TOKEN` | When AI is on | — | Shared secret sent to the AI service (min. 32 characters) |
| `AI_TIMEOUT_MS` | No | `25000` | Time limit for one AI service call |
| `AI_WORKER_ENABLED` | No | `true` | Run the background AI worker in this process |
| `AI_WORKER_POLL_MS` | No | `3000` | How often the worker checks for queued jobs when idle |
| `AI_JOB_MAX_ATTEMPTS` | No | `5` | Attempts per AI job before it is marked failed |

> **Note:** SMTP and S3 variables are optional. If S3 variables are absent, attachment presign endpoints return `503 Service Unavailable` instead of failing at startup.

---

## Project Structure

```
backend/
├── src/
│   ├── app.ts                  # Express app factory (middleware, routes, Swagger)
│   ├── server.ts               # HTTP server entry point
│   ├── config/
│   │   └── env.ts              # Zod schema — validates and exports typed env
│   ├── docs/
│   │   └── swagger.ts          # OpenAPI spec generated from JSDoc annotations
│   ├── features/               # One folder per domain — routes, controller, service, schemas
│   │   ├── ai/                 # AI integration: client, job queue, worker, staff endpoints
│   │   ├── auth/
│   │   ├── companies/
│   │   ├── issues/
│   │   ├── products/
│   │   └── users/
│   ├── lib/
│   │   ├── prisma.ts           # Singleton Prisma client
│   │   └── s3.ts               # S3 client and presign helpers
│   ├── middleware/
│   │   ├── authenticate.ts     # JWT verification + requireRole guard
│   │   ├── errorHandler.ts     # Global error handler + AppError class
│   │   └── rateLimiter.ts      # authRateLimiter (5/15 min) + generalRateLimiter
│   └── types/
│       └── express.d.ts        # Augments Express Request with user + requestId
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── migrations/             # Prisma migration history
│   └── seed.ts                 # Demo data seed
├── tests/                      # Vitest + supertest integration tests (see Testing)
├── keys/                       # RSA key pair — gitignored, generated per environment
├── ecosystem.config.js         # PM2 process definition for production
└── prisma.config.ts            # Prisma v7 config (schema path, seed command)
```

### Feature module layout

Each feature follows the same three-layer pattern:

```
feature/
├── feature.routes.ts     # Express Router + OpenAPI JSDoc annotations
├── feature.controller.ts # Request parsing, calls service, sends response
├── feature.service.ts    # Business logic, Prisma queries
└── feature.schemas.ts    # Zod schemas for request body validation
```

---

## Architecture

### Multi-tenant isolation

Every Prisma query in service files is scoped by the caller's identity, injected by the `authenticate` middleware into `req.user`:

- **client_user** — can only access resources belonging to their `company_id`
- **engineer** — scoped to products they have been granted access to via `user_product_access`
- **admin** — unrestricted access across all tenants

The API always returns `404` (never `403`) when a resource exists but the caller cannot access it — this prevents resource enumeration.

### AI integration

AI features run in a separate Python service ([ai-service/](../ai-service/README.md)). This backend owns all data; the AI service has no database access and only sees what it's sent.

```
client creates issue ──┐
                       ├─ one transaction: issue + ai_jobs row ──► 201 to the client (no waiting)
                       ┘
worker (in-process) ── claims due jobs (FOR UPDATE SKIP LOCKED)
       │
       ├─► POST /v1/analyze  ──► AI service ──► Gemini
       │
       └─ one transaction: ai_suggestions + ai_sentiments + ai_call_logs, job → done
                       │
engineer reviews ──► apply / edit / reject ──► normal issue update (priority, activity log)
```

- **Transactional outbox.** The `ai_jobs` row is inserted in the same transaction as the issue or comment, so a job exists if and only if its data was saved, and saving never waits for the AI service.
- **Durable, concurrent-safe queue.** Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so multiple workers never process the same job. A job whose worker crashed is reclaimed after 5 minutes. Completion re-checks the lock, so a reclaimed job can't be written twice.
- **Retries.** Retryable failures (timeouts, rate limits, outages, invalid model output) are retried with exponential backoff (30s doubling to 15 min, ±20% jitter) up to `AI_JOB_MAX_ATTEMPTS`. Non-retryable ones (e.g. a safety block) fail at once. Failed analyses can be re-queued from the API.
- **Circuit breaker.** After 3 consecutive outages the client pauses calls for 30 seconds, and the worker stops claiming jobs instead of letting each one wait out a timeout.
- **Defence in depth.** Every AI service response is validated again with Zod before anything is stored.
- **The AI never changes an issue.** The worker writes only AI tables. Applying a suggestion goes through `updateIssue`, so tenancy, the ITIL priority matrix and the activity log all apply, and the change is attributed to the reviewer.
- **Sentiment is separate from priority.** It's stored in `ai_sentiments` and never read by any priority logic. Only client-written text is analysed: the issue itself and client comments, never staff or internal comments.
- **Staff only.** AI endpoints require the engineer or admin role and the same tenancy filter as the issue. No client-facing response includes AI data.

**Similar issues and suggested resolutions** use the same queue to keep a similarity index in step with resolved issues:

- An `index_issue` job is queued when an issue is resolved or closed, reopened, edited while resolved, or gets a staff comment while resolved. The worker reads the issue's *current* state: resolved or closed is indexed (staff comments become the resolution notes), anything else is removed. At most one sync per issue is queued at a time.
- Searches are synchronous (they're fast) and scoped to the issue's company **and the products the viewer can open**, so an engineer never sees an issue they couldn't open, even within the same company.
- Every result from the AI service is re-checked here against the viewer's tenancy before it's returned, which also drops issues reopened or deleted since they were indexed.
- `npm run ai:reindex` queues every resolved issue for indexing and removes index entries for deleted issues. Run it after seeding or restoring a database.

**Insights for staff:**

- **Thread summaries** (admins) are generated on request for threads of 3 or more comments, including internal notes. Each key point cites the comments it comes from (or `"description"`), and citations of anything outside the issue are dropped here as a second check. A summary is marked `stale` once newer comments exist.
- **High-risk issues** are open issues whose *latest* sentiment reading is high escalation risk, within the viewer's tenancy. A client who calms down drops off the list. Priority is shown next to the risk and never changed by it.
- **Client health** (admins) aggregates the stored sentiment readings per company: weekly average frustration, share of negative messages and high-risk readings, and the last 30 days against the 30 before (`improving`, `stable`, `worsening`, or `insufficient_data`). It makes no LLM calls.

### Request lifecycle

```
Request
  → Helmet (security headers)
  → CORS
  → express.json (body parsing, 1 MB limit)
  → pino-http (structured logging with request ID)
  → authenticate middleware (JWT verification)
  → requireRole guard (optional, per route)
  → Controller (validates body with Zod)
  → Service (business logic + Prisma)
  → Response
  → errorHandler (catches AppError and unexpected errors)
```

### Priority computation

Priority is never set directly by users. It is computed from the ITIL Impact × Urgency matrix on every create and update:

| | Low Urgency | Medium Urgency | High Urgency |
|---|---|---|---|
| **Low Impact** | low | low | moderate |
| **Medium Impact** | low | moderate | high |
| **High Impact** | moderate | high | critical |

---

## API Reference

All endpoints are prefixed with `/api`. Authentication uses `Authorization: Bearer <access_token>`.

Interactive documentation with try-it-out: **`/api-docs`** (Swagger UI)
Raw OpenAPI JSON: **`/api-docs.json`**

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Returns `{ status: "ok", version, timestamp }` |

### AI — `/api/ai`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/ai/config` | All | Returns `{ enabled }` so the frontend can hide AI UI when `AI_ENABLED=false` |
| GET | `/issues/:id/ai/suggestion` | engineer, admin | Latest triage suggestion and analysis status (`none`, `queued`, `running`, `done`, `failed`) |
| POST | `/issues/:id/ai/suggestion/:suggestionId/review` | engineer, admin | `{ action: "apply", impact?, urgency?, category?, team? }` or `{ action: "reject" }`. Recorded as `accepted` or `edited` from the data. `409` if already reviewed. |
| POST | `/issues/:id/ai/analyze` | engineer, admin | Re-queue analysis, e.g. after a failure. `409` while one is queued or running. |
| GET | `/issues/:id/ai/sentiment` | engineer, admin | Sentiment timeline: the issue plus each client comment |
| GET | `/issues/:id/ai/similar` | engineer, admin | Up to 5 similar resolved issues, same company, viewer's products only. `503 AI_UNAVAILABLE` if the AI service is down. |
| GET | `/issues/:id/ai/resolution` | engineer, admin | Latest suggested resolution, or `null` |
| POST | `/issues/:id/ai/resolution` | engineer, admin | Generate a suggested resolution with citations to past tickets |
| POST | `/issues/:id/ai/resolution/:resolutionId/feedback` | engineer, admin | `{ feedback: "helpful" \| "not_helpful" }`, recorded once |
| GET | `/issues/:id/ai/summary` | admin | Latest thread summary (with `stale`), and the current comment count |
| POST | `/issues/:id/ai/summary` | admin | Summarise the thread. `422 THREAD_TOO_SHORT` under 3 comments. |
| GET | `/ai/escalations` | engineer, admin | Open issues whose latest sentiment is high escalation risk |
| GET | `/ai/client-health?days=90` | admin | Sentiment trend per company (14–365 days) |

All AI routes return `404 AI_DISABLED` when `AI_ENABLED=false`, and `403` to clients.

### Authentication — `/api/auth`

| Method | Path | Auth | Rate limit | Description |
|--------|------|------|------------|-------------|
| POST | `/auth/register` | None | 5 req / 15 min | Self-register as a client user. Returns access + refresh token pair. |
| POST | `/auth/login` | None | 5 req / 15 min | Email + password login. Returns access + refresh token pair. |
| POST | `/auth/refresh` | None | General | Rotate refresh token and get a new access token. |
| POST | `/auth/logout` | Required | — | Invalidate refresh token. Omit body to revoke all sessions. |
| GET | `/auth/me` | Required | General | Get current user profile (used to hydrate frontend on boot). |

### Issues — `/api/issues`

All issue routes require authentication.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/issues` | All | Paginated, filtered list. Scope is role-dependent (see below). |
| POST | `/issues` | All | Create issue. Priority auto-computed from impact × urgency. |
| GET | `/issues/stats` | admin | Dashboard KPIs: open count, critical count, SLA-at-risk, resolved last 7 days. |
| GET | `/issues/export` | admin | Export up to 1,000 issues as `csv` or `json`. |
| GET | `/issues/saved-views` | All | List the current user's saved filter presets. |
| POST | `/issues/saved-views` | All | Create a named saved view (name + query object). |
| PATCH | `/issues/saved-views/:viewId` | All | Rename a saved view (owner only). |
| DELETE | `/issues/saved-views/:viewId` | All | Delete a saved view (owner only). |
| GET | `/issues/:id` | All | Full issue detail with comments, activity log, and attachments. |
| PATCH | `/issues/:id` | All | Partial update. Activity log entry created for every changed field. |
| DELETE | `/issues/:id` | admin | Soft-cancel — sets status to `cancelled`. Irreversible. |
| POST | `/issues/:id/assign` | admin, engineer | Assign an engineer. Assignee must have `engineer` role and be active. |
| POST | `/issues/:id/resolve` | admin, engineer | Transition to `resolved`. Issue must be `in_progress` or `on_hold`. |
| POST | `/issues/:id/comments` | All | Add a comment. `isInternal: true` is blocked for `client_user`. |
| GET | `/issues/:id/feed` | All | Combined timeline of comments and activity entries, sorted by time. |
| POST | `/issues/:id/attachments/presign` | All | Request a presigned S3 PUT URL (valid 5 min). |
| POST | `/issues/:id/attachments` | All | Confirm upload and persist attachment record. |
| GET | `/issues/:id/attachments/:attId/download` | All | Get a presigned S3 GET URL (valid 15 min). |

**`GET /issues` query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | — | Full-text search on ticket number, title, description |
| `status` | enum | — | `new` \| `in_progress` \| `on_hold` \| `resolved` \| `closed` \| `cancelled` |
| `priority` | enum | — | `low` \| `moderate` \| `high` \| `critical` |
| `type` | enum | — | `bug` \| `feature_request` \| `question` \| `incident` |
| `product_id` | string | — | Filter to a specific product |
| `assigned_to` | string | — | Filter by assignee user ID |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Max 100 |
| `sort` | enum | `createdAt_desc` | `createdAt_desc` \| `createdAt_asc` \| `updatedAt_desc` |

### Companies — `/api/companies` (admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/companies` | List all companies |
| POST | `/companies` | Create a company (`name`, `contactEmail`, `region`) |
| GET | `/companies/:id` | Company detail including its products |
| PATCH | `/companies/:id` | Partial update |

### Products — `/api/products`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/products` | All | Role-filtered list (admin: all, engineer: assigned, client: company products) |
| POST | `/products` | admin | Create product. `code` is immutable after creation. |
| GET | `/products/:id` | All | Product detail. Returns 404 if caller cannot access it. |
| PATCH | `/products/:id` | admin | Partial update. `code` and `companyId` are immutable. |

### Users — `/api/users`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/users/me` | All | Own profile |
| PATCH | `/users/me/password` | All | Change own password (current password required) |
| GET | `/users/engineers` | admin, engineer | List engineers (used to populate assignee dropdowns) |
| GET | `/users` | admin | List all users |
| POST | `/users` | admin | Create user. `client_user` requires `companyId`, engineer/admin optionally take `office`. |
| GET | `/users/:id` | admin | User detail with product access list |
| PATCH | `/users/:id` | admin | Partial update. `isActive: false` deactivates without deleting. |
| POST | `/users/:id/products` | admin | Grant product access to an engineer (idempotent) |
| DELETE | `/users/:id/products/:productId` | admin | Revoke product access from an engineer |

---

## Data Model

```
companies ──< products ──< issues ──< issue_comments ──< ai_sentiments (per comment)
    │              │           │
    └──< users     │           ├──< issue_activity
         │         │           ├──< issue_attachments
         │         │           ├──< ai_jobs
         │         │           ├──< ai_suggestions
         │         │           └──< ai_sentiments (issue)
         └── user_product_access (engineers ↔ products)
         └──< refresh_tokens

ai_call_logs (no foreign keys: an audit trail that outlives issues)
```

### Key tables

**`companies`** — Client tenants. Each has a `region` (KR / LK / IN / GLOBAL).

**`products`** — Software products owned by a company. The `code` (e.g. `APTWEB`) is used as the ticket number prefix (`APTWEB-0001`). The `owning_office` determines which engineering center handles issues.

**`users`** — Three roles: `client_user`, `engineer`, `admin`. Client users have a `company_id`. Engineers have an `office`. Admins have neither.

**`user_product_access`** — Join table that grants an engineer access to a specific product. Engineers can only see issues for products in this table.

**`issues`** — Core entity. `priority` is a computed column (never user-set). `category` and `team` are optional and set by staff, usually by accepting an AI suggestion. `ticket_number` is assigned atomically using a count of existing issues per product. The status machine allows: `new → in_progress → on_hold → in_progress → resolved → closed`.

**`issue_comments`** — `is_internal` comments are hidden from `client_user` in all API responses.

**`issue_activity`** — Immutable audit log. One row per changed field, storing `old_value` and `new_value` as strings.

**`issue_attachments`** — Metadata record created after the client confirms an S3 upload. The `s3_key` is never exposed directly; only presigned URLs are returned.

**`ai_jobs`** — Durable queue of AI work, inserted with the issue or comment it belongs to. Tracks attempts, backoff and the worker holding the lock.

**`ai_suggestions`** — One triage suggestion (impact, urgency, category, team, each with a reason) plus what the reviewer did: `pending`, `accepted`, `edited`, `rejected` or `superseded`. Suggested and applied values are both kept, so acceptance can be reported per field. Records the model and prompt version.

**`ai_sentiments`** — Sentiment, frustration (1–5, enforced by a `CHECK` constraint), escalation risk and a verbatim evidence quote for the issue or one client comment.

**`ai_call_logs`** — Every AI service call: feature, outcome, latency and token usage.

**`ai_thread_summaries`** — Each thread summary with its key points and citations, open questions, model and prompt version, and the newest comment it covered (to detect staleness).

**`ai_resolution_suggestions`** — Each suggested resolution with its steps, cited tickets, a snapshot of the sources shown, model and prompt version, and whether the engineer marked it helpful.

Every AI table stores `company_id`, copied from the issue's product when the row is written, so each row carries its own tenant and per-company reports need no joins.

**`refresh_tokens`** — Server-side refresh token store. Tokens are stored as SHA-256 hashes. Each use invalidates the current token and issues a new one (rotation).

---

## Authentication

The API uses **RS256 asymmetric JWT**:

- **Access token** — signed with the RSA private key, verified with the public key. Short-lived (15 min). Carries `sub` (user ID), `email`, `role`, `companyId`.
- **Refresh token** — 128-byte random hex string, stored as a SHA-256 hash in the database. Long-lived (7 days). Supports rotation — each use issues a new pair and invalidates the old token.

RSA keys are generated per environment and are never committed to git:

```bash
npm run keys:generate   # writes keys/private.pem and keys/public.pem
```

The `authenticate` middleware verifies the access token on every protected route and attaches the decoded payload to `req.user`.

---

## Testing

Integration tests drive the real Express app over HTTP (supertest) against a real database, so they exercise routing, auth middleware, validation, tenancy filters, and SQL together.

```bash
npm test             # run the suite once
npm run test:watch   # re-run on file changes
npm run typecheck    # type-check src/ and tests/
```

**Requirements:** Docker must be running. The first run downloads the Postgres image, which takes a few minutes; later runs take about 1–2 minutes.

**How the test database works** (`tests/global-setup.ts`):

1. A throwaway PostgreSQL 17 container (`pgvector/pgvector:pg17`, the same image as `docker-compose.yml`) is started with [Testcontainers](https://testcontainers.com/). Your local database is never touched.
2. The real Prisma migrations are applied to it with `prisma migrate deploy`.
3. A temporary RSA key pair is generated for signing test JWTs.
4. Everything is removed when the run finishes.

To use an existing empty database instead of a container, set `TEST_DATABASE_URL`. **The tests delete all rows in it.**

**Test layout:**

| File | What it proves |
|------|----------------|
| `tenancy.issues.test.ts` | A client from another company, or an engineer without product access, gets `404` on every issue route and sub-resource (detail, update, assign, resolve, feed, comments, attachments), and the probes change nothing. Lists, search, filters, and stats never include other tenants' issues. Search is case-insensitive. |
| `tenancy.products.test.ts` | Product listing and detail are tenant-filtered; admin-only routes return `403` to clients and engineers. |
| `internal-comments.test.ts` | Clients never receive internal comments through issue detail or the feed, and cannot post them. |
| `priority.test.ts` | All nine cells of the ITIL impact × urgency matrix, defaults, and recomputation on update. |
| `auth.test.ts` | Missing, malformed, forged, expired, and HS256 algorithm-confusion tokens are rejected. |
| `ai-config.test.ts` | The `AI_ENABLED` flag: `/api/ai/config`, AI routes disabled, no jobs queued, and startup refused without `AI_SERVICE_TOKEN`. |
| `ai-pipeline.test.ts` | Jobs are queued with the issue or comment (clients only) without calling the AI service; the worker stores results and never changes the issue; retries, backoff, failure, timeouts, invalid responses and the circuit breaker; `SKIP LOCKED` and stale-lock recovery. Runs against a stub AI service over real HTTP. |
| `ai-insights.test.ts` | Summaries send the whole thread with trusted roles, drop foreign citations, store description citations, go stale on new comments, refuse short threads, admin only; high-risk list uses only the latest reading, ignores resolved issues, follows tenancy, never changes priority; client health buckets by week, computes the 30-day trend, includes companies without data, admin only. |
| `ai-retrieval.test.ts` | Index syncs queued on resolve, reopen, edit and staff comment (never twice); the worker indexes with staff notes only and removes reopened issues; searches scoped to company and viewer's products; every result the viewer couldn't open is dropped, even for admins; resolutions stored with cost and once-only feedback. |
| `ai-api.test.ts` | Tenancy on every AI route, clients get `403`, no client response contains AI data, accept/edit/reject, review-once (including two simultaneous reviews), retry, and staff-only `category`/`team`. |

`tests/helpers/fixtures.ts` builds a small two-company world (Acme and Globex, each with a product, a client, and an engineer, plus an admin) that every test probes across. Test files run one at a time because they share the database.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (`node dist/server.js`) |
| `npm test` | Run the integration test suite (requires Docker) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check application, test and script code |
| `npm run ai:reindex` | Rebuild and reconcile the similarity index (needs `AI_ENABLED=true`) |
| `npm run keys:generate` | Generate RSA key pair in `keys/` |
| `npx prisma migrate dev` | Apply migrations and run seed |
| `npx prisma migrate deploy` | Apply migrations in production (no seed) |
| `npx tsx prisma/seed.ts` | Run seed directly |
| `npx prisma studio` | Open Prisma Studio (database browser) |
