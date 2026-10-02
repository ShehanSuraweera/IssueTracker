# NewnopDesk

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A multi-tenant client issue portal for software agencies — purpose-built around Newnop's operating model of 50+ client products across engineering centers in Korea, Sri Lanka, and India.

Inspired by ServiceNow and Jira Service Management, NewnopDesk gives each client a dedicated workspace to raise and track issues, while routing tickets to the right internal engineering team and giving leadership cross-portfolio visibility.

An AI assistant helps staff with the routine work: it suggests triage for new issues, tracks client sentiment, finds similar past issues with a suggested fix, and summarises long threads. Staff approve every suggestion; the AI never changes an issue itself, and client sentiment never changes priority.

---

## Screenshots

| | |
|---|---|
| ![Sign In](docs/screenshots/signin.png) | ![Register](docs/screenshots/register.png) |
| ![Create Issue](docs/screenshots/create-issue.png) | ![Dashboard](docs/screenshots/dashboard.png) |
| ![Issue List](docs/screenshots/issue-list.png) | ![Issue Detail](docs/screenshots/issue-detail.png) |

---

## Live Demo

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@newnop.com` | `Demo@2026` |
| Engineer (Sri Lanka) | `ravindu@newnop.com` | `Demo@2026` |
| Client (Apartment LK) | `feedback@apartment-lk.com` | `Demo@2026` |

---

## Documentation

| Document | Description |
|----------|-------------|
| [AI Features](docs/ai.md) | What the AI does, architecture, design decisions, safety, eval results |
| [Deployment Guide](docs/deployment.md) | Complete AWS setup, CI/CD, environment variables, runbook |
| [Backend README](backend/README.md) | API reference, data model, AI job queue, local development |
| [Frontend README](frontend/README.md) | Component structure, state management, AI panels, local development |
| [AI Service README](ai-service/README.md) | Python service: API contract, code layout, tests |
| [Evaluations](ai-service/evals/README.md) | Labelled eval data, method and full results |

---

## Architecture

```mermaid
flowchart LR
    U[Browser] --> CF[CloudFront]
    CF -->|static files| S3[("S3: React app")]
    CF -->|/api| N

    subgraph EC2["EC2 t3.micro"]
        N["Nginx → Express API<br/>+ AI job worker (PM2)"]
        A["AI service<br/>FastAPI (Docker)"]
    end

    N -->|"127.0.0.1, service token"| A
    N --> DB[("RDS PostgreSQL 17<br/>app data + pgvector")]
    A -->|"own schema and role"| DB
    A --> G[Gemini API]
    N -->|presigned URLs| S3F[("S3: attachments")]
```

The Express API owns all data and every access decision. AI work is queued in PostgreSQL in the same transaction as the issue or comment and processed in the background, so the app never waits for the AI and keeps working if it's down. The AI service only sees the text it's sent, and its database role can't read application tables. Details in [docs/ai.md](docs/ai.md).

---

## AI Features

All AI panels are for staff only. Clients never see AI output.

| Feature | What staff get |
|---|---|
| **Triage suggestion** | Impact, urgency, category and owning team for each new issue, with reasons and the resulting priority. Apply, edit or reject. |
| **Client mood** | Sentiment, frustration and escalation risk on every client message, with the quoted evidence. High-risk issues are flagged on the dashboard. |
| **Similar issues and suggested fix** | Resolved issues from the same company, and a fix built from their resolution notes that cites its sources. |
| **Thread summary** | Key points citing the comments they came from, and open questions (admins). |
| **Client health** | Weekly sentiment trend per client company (admins). |

**Measured, not assumed** ([full results](ai-service/evals/README.md)), on labelled data with the real model:

| | Result | Baseline |
|---|---|---|
| Team routing | **91%** | 49% routing by product |
| Priority | **79%** (99% within one level) | 63% using the client's own impact and urgency |
| Sentiment agreement | **87.5%**, Cohen's κ 0.79 | 55% always guessing the most common label |
| Similar-issue recall@5 | **100%**, 0 cross-company results | – |
| Prompt-injection attacks blocked | **24 of 24** | – |

---

## Tech Stack

**Frontend:** React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui · TanStack Query · Zustand · React Hook Form · Zod

**Backend:** Node.js · Express · TypeScript · Prisma · PostgreSQL 17

**AI service:** Python 3.12 · FastAPI · Pydantic · Google Gemini (`gemini-3.5-flash-lite`) · fastembed (local embeddings) · pgvector · uv · pytest

**Infrastructure:** AWS EC2 · RDS for PostgreSQL · S3 · CloudFront · Nginx · PM2 · Docker · GitHub Container Registry

**CI/CD:** GitHub Actions — tests must pass before every deploy; the AI service ships as an image built in CI

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 24 LTS
- Docker (runs PostgreSQL locally and powers the integration tests)
- Git

### Backend

```bash
docker compose up -d db       # PostgreSQL 17 + pgvector on localhost:5432
cd backend
cp .env.example .env          # DATABASE_URL already matches the local database
npm install
npm run keys:generate         # generates RSA keys for JWT signing
npx prisma migrate dev
npx tsx prisma/seed.ts
npm run dev
```

API runs at `http://localhost:4000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173` — API calls proxy to `localhost:4000` via Vite config.

### AI service (optional)

The app works without it. To turn the AI features on:

```bash
cd ai-service
cp .env.example .env          # set GEMINI_API_KEY and AI_SERVICE_TOKEN (or AI_PROVIDER=fake for no key)
uv sync
uv run ai-db bootstrap --admin-url postgresql://newnopdesk:newnopdesk_local@127.0.0.1:5432/newnopdesk
uv run ai-db migrate
uv run ai-serve               # http://127.0.0.1:8000
```

Then set `AI_ENABLED=true` and the same `AI_SERVICE_TOKEN` in `backend/.env`, restart the backend, and fill the AI data for the seeded issues with `npm run ai:reindex` and `npm run ai:backfill`. See the [AI service README](ai-service/README.md#running-locally).

---

## Repository Structure

```
IssueTracker/
├── .github/
│   └── workflows/
│       ├── ci.yml                # Backend typecheck + integration tests
│       ├── ci-ai-service.yml     # AI service lint, types, tests, image build
│       ├── deploy-frontend.yml   # S3 + CloudFront deployment
│       ├── deploy-backend.yml    # Runs ci.yml, then deploys to EC2 via SSH
│       └── deploy-ai-service.yml # Runs ci-ai-service.yml, pushes the image to GHCR, deploys it
├── ai-service/
│   ├── src/ai_service/           # FastAPI app, prompts, LLM providers, retrieval, safety
│   ├── migrations/               # Alembic migrations for the `ai` schema
│   ├── evals/                    # labelled eval data, runner and committed results
│   ├── tests/
│   └── Dockerfile
├── deploy/
│   └── compose.prod.yml          # AI service container on the EC2
├── backend/
│   ├── src/
│   │   ├── features/             # auth, issues, products, users, companies, ai
│   │   ├── middleware/           # authenticate, role guards
│   │   ├── lib/                  # prisma client, S3 helpers
│   │   └── config/               # env validation
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── keys/                     # RSA keys (gitignored, generated locally)
│   ├── ecosystem.config.js       # PM2 process config
│   └── prisma.config.ts
├── frontend/
│   └── src/
│       ├── api/                  # Axios call functions, one file per resource
│       ├── components/
│       │   ├── home/             # home page sections (KPIs, engineer stats, my-work)
│       │   ├── issue/            # issue detail sub-components (header, sidebar, form)
│       │   ├── issues/           # shared issue widgets (timeline, comments, attachments)
│       │   ├── layout/           # AppShell, Header, Sidebar
│       │   └── ui/               # shadcn/ui primitives + custom badges
│       ├── hooks/                # TanStack Query wrappers + utility hooks
│       ├── lib/                  # api-client, format, schemas, theme, utils
│       ├── pages/                # one file per route
│       ├── router/               # createBrowserRouter + route guards
│       ├── store/                # Zustand stores (auth, tabs)
│       └── types/                # TypeScript interfaces mirroring API responses
└── docs/
    ├── ai.md                     # AI features: design, safety, evals
    └── deployment.md             # full AWS deployment guide
```

---

## CI/CD

Every push to `main` triggers automatic deployment:

- **Changes to `frontend/**`** → Vite build → S3 sync → CloudFront cache invalidation
- **Changes to `backend/**`** → integration tests → TypeScript build verified → SSH to EC2 → git pull → rebuild → migrate → pm2 restart
- **Changes to `ai-service/**`** → lint, types, tests → Docker image built and pushed to GitHub Container Registry → SSH to EC2 → migrate → start the new container, rolling back automatically if it isn't healthy

The two EC2 deployments never run at the same time, so a backend build and an image pull don't compete for the instance's 1 GB of memory.

See the [Deployment Guide](docs/deployment.md) for full pipeline documentation.

---

## Design Decisions

**Why a relational database:** The data is highly relational — companies own products, products have issues, issues have comments and activity logs. Foreign keys and joins are the natural fit, which ruled out a document store like MongoDB.

**Why PostgreSQL (migrated from MySQL 8):** The project started on MySQL. The planned AI features need vector similarity search, which RDS MySQL can't do, and running a second database just for vectors would mean two engines, two backups, and keeping them in sync on a 1 GB server. PostgreSQL with the pgvector extension handles both the application data and the vectors in one database, and its role and schema permissions let the AI service be restricted to its own tables. The migration was low-risk: there was no production data to move (the demo database is rebuilt from the seed), only two migrations to regenerate, and the one raw SQL query was already portable. The single behaviour difference was that PostgreSQL's `LIKE` is case-sensitive where MySQL's default collation was not; search now uses `ILIKE`, and a test pins it. RDS connections use verified TLS (`sslmode=verify-full` with Amazon's CA bundle).

**Why search uses `ILIKE`:** Search is a case-insensitive substring match across title, description, and ticket number. At this data size that's fast and simple. PostgreSQL full-text search (a `tsvector` column with a GIN index) is the upgrade path if the data grows.

**Why multi-tenant isolation at the API layer:** Every issue query goes through one function, `buildTenantWhere`, which adds the caller's company or product scope to the Prisma query. That's simple and testable, and integration tests probe every issue route with users from another company to prove nothing leaks. PostgreSQL also supports row-level security, which would add a second, database-enforced layer. It isn't used yet: with a connection pool, it needs the tenant ID set at the start of every transaction, which is a larger change for this stage of the project.

**Why JWT in localStorage:** For this assignment, localStorage simplifies the auth flow. In production, httpOnly cookies with `SameSite=Strict` would prevent XSS token theft. This trade-off is documented and the fix is a one-line change to the cookie configuration.

**Why priority is computed, not selected:** The ITIL Impact × Urgency matrix ensures consistency — no engineer can mark a low-impact, low-urgency issue as Critical. Priority is derived from the two independent inputs and stored for indexed queries.

**Why client sentiment never changes priority:** Tone is not impact. A calm report that every tenant is locked out is critical; a furious complaint about a typo is not. Letting anger raise priority would push polite clients and second-language writers down the queue, teach clients to write angrily, and let a wrong or manipulated AI reading reorder the engineering backlog. So sentiment is stored separately, no priority code reads it, and a test proves the issue is untouched by even the angriest reading. Frustration goes where it's useful: high-risk issues are flagged on the dashboard and client trends on the client-health page, for a human to respond to.

**Why the AI suggests but never decides:** The AI has no write path to issues. Staff apply, edit or reject each suggestion, which keeps accountability with people, limits what a prompt injection can do to "a suggestion someone has to approve", and records every outcome so the acceptance rate can be measured per model and prompt version.

**Why a separate Python service for AI:** Python has the best tooling for strict output validation (Pydantic), LLM SDKs and embeddings. A separate service with its own restricted database role can't read other tenants' data, can fail without taking the app down, and deploys independently as a Docker image. The cost is one local network hop.

**Why pgvector instead of a vector database:** Similar-issue search needs vector similarity. Keeping vectors in the same PostgreSQL, in their own schema and role, means no extra server, backup or sync job on a 1 GB instance, and lets database permissions enforce that the AI service can't touch application tables. At this scale PostgreSQL does an exact search in under a millisecond. Full reasoning in [docs/ai.md](docs/ai.md#3-design-decisions).

**Why the AI service runs in Docker but the backend on PM2:** The AI service has heavy native dependencies (ONNX runtime, an embedding model) that are easiest to ship as a tested image built once in CI; the server just pulls and runs it, with a memory limit so it can't starve the backend. The backend was already running reliably on PM2, and moving it brought no benefit worth the change.

---

## Acknowledgements

Visual design references Newnop's brand palette as published on newnop.com. Layout and UX patterns are inspired by Linear and Jira Service Management.
