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
- [Scripts](#scripts)

---

## Local Development

### Prerequisites

- Node.js 24 LTS
- MySQL 8.0 running locally

### Setup

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL and other values
npm install
npm run keys:generate         # generates RSA key pair in keys/
npx prisma migrate dev        # applies migrations and runs seed automatically
npm run dev                   # starts ts-node-dev with hot reload
```

API runs at **http://localhost:4000**

Interactive API docs (Swagger UI) available at **http://localhost:4000/api-docs**

---

## Environment Variables

All variables are validated at startup via Zod. The server exits immediately if a required value is missing.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | MySQL connection string, e.g. `mysql://user:pass@localhost:3306/newnopdesk` |
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
companies ──< products ──< issues ──< issue_comments
    │              │           │
    └──< users     │           ├──< issue_activity
         │         │           └──< issue_attachments
         └── user_product_access (engineers ↔ products)
         └──< refresh_tokens
```

### Key tables

**`companies`** — Client tenants. Each has a `region` (KR / LK / IN / GLOBAL).

**`products`** — Software products owned by a company. The `code` (e.g. `APTWEB`) is used as the ticket number prefix (`APTWEB-0001`). The `owning_office` determines which engineering center handles issues.

**`users`** — Three roles: `client_user`, `engineer`, `admin`. Client users have a `company_id`. Engineers have an `office`. Admins have neither.

**`user_product_access`** — Join table that grants an engineer access to a specific product. Engineers can only see issues for products in this table.

**`issues`** — Core entity. `priority` is a computed column (never user-set). `ticket_number` is assigned atomically using a count of existing issues per product. The status machine allows: `new → in_progress → on_hold → in_progress → resolved → closed`.

**`issue_comments`** — `is_internal` comments are hidden from `client_user` in all API responses.

**`issue_activity`** — Immutable audit log. One row per changed field, storing `old_value` and `new_value` as strings.

**`issue_attachments`** — Metadata record created after the client confirms an S3 upload. The `s3_key` is never exposed directly; only presigned URLs are returned.

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

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (`node dist/server.js`) |
| `npm run keys:generate` | Generate RSA key pair in `keys/` |
| `npx prisma migrate dev` | Apply migrations and run seed |
| `npx prisma migrate deploy` | Apply migrations in production (no seed) |
| `npx tsx prisma/seed.ts` | Run seed directly |
| `npx prisma studio` | Open Prisma Studio (database browser) |
