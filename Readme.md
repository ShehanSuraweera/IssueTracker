# NewnopDesk

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A multi-tenant client issue portal for software agencies — purpose-built around Newnop's operating model of 50+ client products across engineering centers in Korea, Sri Lanka, and India.

Inspired by ServiceNow and Jira Service Management, NewnopDesk gives each client a dedicated workspace to raise and track issues, while routing tickets to the right internal engineering team and giving leadership cross-portfolio visibility.

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
| [Deployment Guide](docs/deployment.md) | Complete AWS setup, CI/CD, environment variables, runbook |
| [Backend README](backend/README.md) | API reference, data model, local development |
| [Frontend README](frontend/README.md) | Component structure, state management, local development |

---

## Tech Stack

**Frontend:** React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui · TanStack Query · Zustand · React Hook Form · Zod

**Backend:** Node.js · Express · TypeScript · Prisma · PostgreSQL 17

**Infrastructure:** AWS EC2 · RDS for PostgreSQL · S3 · CloudFront · Nginx · PM2 · Docker (local development)

**CI/CD:** GitHub Actions — integration tests must pass before every backend deploy

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

---

## Repository Structure

```
localdev/
├── .github/
│   └── workflows/
│       ├── ci.yml                # Typecheck + integration tests
│       ├── deploy-frontend.yml   # S3 + CloudFront deployment
│       └── deploy-backend.yml    # Runs ci.yml, then deploys to EC2 via SSH
├── backend/
│   ├── src/
│   │   ├── features/             # auth, issues, products, users, companies
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
    └── deployment.md             # full AWS deployment guide
```

---

## CI/CD

Every push to `main` triggers automatic deployment:

- **Changes to `frontend/**`** → Vite build → S3 sync → CloudFront cache invalidation
- **Changes to `backend/**`** → TypeScript build verified → SSH to EC2 → git pull → rebuild → pm2 restart

See the [Deployment Guide](docs/deployment.md) for full pipeline documentation.

---

## Design Decisions

**Why a relational database:** The data is highly relational — companies own products, products have issues, issues have comments and activity logs. Foreign keys and joins are the natural fit, which ruled out a document store like MongoDB.

**Why PostgreSQL (migrated from MySQL 8):** The project started on MySQL. The planned AI features need vector similarity search, which RDS MySQL can't do, and running a second database just for vectors would mean two engines, two backups, and keeping them in sync on a 1 GB server. PostgreSQL with the pgvector extension handles both the application data and the vectors in one database, and its role and schema permissions let the AI service be restricted to its own tables. The migration was low-risk: there was no production data to move (the demo database is rebuilt from the seed), only two migrations to regenerate, and the one raw SQL query was already portable. The single behaviour difference was that PostgreSQL's `LIKE` is case-sensitive where MySQL's default collation was not; search now uses `ILIKE`, and a test pins it. RDS connections use verified TLS (`sslmode=verify-full` with Amazon's CA bundle).

**Why search uses `ILIKE`:** Search is a case-insensitive substring match across title, description, and ticket number. At this data size that's fast and simple. PostgreSQL full-text search (a `tsvector` column with a GIN index) is the upgrade path if the data grows.

**Why multi-tenant isolation at the API layer:** Every issue query goes through one function, `buildTenantWhere`, which adds the caller's company or product scope to the Prisma query. That's simple and testable, and integration tests probe every issue route with users from another company to prove nothing leaks. PostgreSQL also supports row-level security, which would add a second, database-enforced layer. It isn't used yet: with a connection pool, it needs the tenant ID set at the start of every transaction, which is a larger change for this stage of the project.

**Why JWT in localStorage:** For this assignment, localStorage simplifies the auth flow. In production, httpOnly cookies with `SameSite=Strict` would prevent XSS token theft. This trade-off is documented and the fix is a one-line change to the cookie configuration.

**Why priority is computed, not selected:** The ITIL Impact × Urgency matrix ensures consistency — no engineer can mark a low-impact, low-urgency issue as Critical. Priority is derived from the two independent inputs and stored for indexed queries.

---

## Acknowledgements

Visual design references Newnop's brand palette as published on newnop.com. Layout and UX patterns are inspired by Linear and Jira Service Management.
