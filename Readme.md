# NewnopDesk

A multi-tenant client issue portal for software agencies — purpose-built around Newnop's operating model of 50+ client products across engineering centers in Korea, Sri Lanka, and India.

Inspired by ServiceNow and Jira Service Management, NewnopDesk gives each client a dedicated workspace to raise and track issues, while routing tickets to the right internal engineering team and giving leadership cross-portfolio visibility.

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

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · TanStack Query · Zustand · React Hook Form · Zod

**Backend:** Node.js · Express · TypeScript · Prisma · MySQL 8.0

**Infrastructure:** AWS EC2 · RDS · S3 · CloudFront · Nginx · PM2

**CI/CD:** GitHub Actions

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 24 LTS
- MySQL 8.0 running locally
- Git

### Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL and other values
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
│       ├── deploy-frontend.yml   # S3 + CloudFront deployment
│       └── deploy-backend.yml    # EC2 deployment via SSH
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

**Why MySQL over MongoDB:** The data is highly relational — companies own products, products have issues, issues have comments and activity logs. Foreign keys and joins are the natural fit. MySQL's FULLTEXT index also powers the debounced search without a separate search service.

**Why multi-tenant isolation at the API layer:** Row-level security in MySQL is complex to set up and maintain. Middleware that injects the user's `company_id` into every Prisma query is simpler, fully testable, and just as secure for this use case.

**Why JWT in localStorage:** For this assignment, localStorage simplifies the auth flow. In production, httpOnly cookies with `SameSite=Strict` would prevent XSS token theft. This trade-off is documented and the fix is a one-line change to the cookie configuration.

**Why priority is computed, not selected:** The ITIL Impact × Urgency matrix ensures consistency — no engineer can mark a low-impact, low-urgency issue as Critical. Priority is derived from the two independent inputs and stored for indexed queries.

---

## Acknowledgements

Visual design references Newnop's brand palette as published on newnop.com. Layout and UX patterns are inspired by Linear and Jira Service Management.
