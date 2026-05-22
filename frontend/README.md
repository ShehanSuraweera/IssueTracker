# NewnopDesk — Frontend

React 19 SPA for the NewnopDesk issue portal. Delivers a role-aware UI across three personas — client user, engineer, and admin — with a tab-based navigation model inspired by Linear.

---

## Table of Contents

- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Routing and Access Control](#routing-and-access-control)
- [Pages](#pages)
- [State Management](#state-management)
- [Data Fetching](#data-fetching)
- [API Client](#api-client)
- [Component Library](#component-library)
- [Key Design Decisions](#key-design-decisions)

---

## Local Development

### Prerequisites

- Node.js 24 LTS
- Backend running at `http://localhost:4000`

### Setup

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

Vite proxies all `/api` requests to `localhost:4000`, so no CORS configuration is needed locally.

### Other scripts

| Script | Description |
|--------|-------------|
| `npm run build` | TypeScript check + Vite production build into `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build locally |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | Base URL for all API calls. Override only when the API is on a different origin. In production, CloudFront routes `/api/*` to EC2, so the default `/api` works without setting this variable. |

---

## Project Structure

```
frontend/src/
├── api/                    # Axios call functions — one file per resource
│   ├── client.ts           # Axios instance, token interceptors, silent refresh logic
│   ├── auth.ts
│   ├── companies.ts
│   ├── issues.ts
│   ├── products.ts
│   └── users.ts
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx    # Root layout: sidebar + header + <Outlet>; manages tab state
│   │   ├── Header.tsx      # Tab bar + user menu + logout
│   │   └── Sidebar.tsx     # Navigation links, role-filtered
│   └── ui/                 # shadcn/ui primitives (no business logic)
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── newnop-logo.tsx
│       ├── separator.tsx
│       ├── skeleton.tsx
│       └── tooltip.tsx
├── hooks/                  # TanStack Query wrappers — co-locate mutation + invalidation
│   ├── query-keys.ts       # Centralised key factory
│   ├── use-auth.ts
│   ├── use-companies.ts
│   ├── use-issues.ts
│   ├── use-products.ts
│   └── use-users.ts
├── lib/
│   ├── query-client.ts     # QueryClient singleton (staleTime: 30 s)
│   └── utils.ts            # cn() helper (clsx + tailwind-merge)
├── pages/
│   ├── HomePage.tsx        # Landing page / redirect based on role
│   ├── LoginPage.tsx       # Email + password login form
│   ├── NotFoundPage.tsx    # 404
│   ├── admin/
│   │   ├── DashboardPage.tsx     # KPI cards + charts (admin only)
│   │   ├── CompanyListPage.tsx   # Company management
│   │   ├── CompanyDetailPage.tsx # Company + its products
│   │   ├── ProductListPage.tsx   # Product management
│   │   ├── UserListPage.tsx      # User management
│   │   └── UserDetailPage.tsx    # User + product access grants
│   ├── issues/
│   │   ├── IssueListPage.tsx     # Filterable, searchable issue table
│   │   ├── IssueDetailPage.tsx   # Full issue view with feed, comments, attachments
│   │   └── IssueCreatePage.tsx   # New issue form
│   └── settings/
│       └── PasswordPage.tsx      # Change own password
├── router/
│   ├── index.tsx           # createBrowserRouter — all route definitions
│   └── guards.tsx          # RequireAuth, RequireRole, RedirectIfAuth
├── store/
│   ├── auth.store.ts       # Zustand: current user, persisted to localStorage
│   └── tabs.store.ts       # Zustand: open tabs, persisted to sessionStorage
└── types/                  # TypeScript interfaces mirroring API responses
    ├── auth.ts
    ├── companies.ts
    ├── issues.ts
    ├── products.ts
    └── users.ts
```

---

## Routing and Access Control

Routes are defined in [router/index.tsx](src/router/index.tsx) using React Router v7's `createBrowserRouter`. All pages are lazy-loaded with a skeleton fallback.

### Route guards

| Guard | File | Behaviour |
|-------|------|-----------|
| `RequireAuth` | `router/guards.tsx` | Redirects unauthenticated users to `/login` |
| `RequireRole` | `router/guards.tsx` | Redirects users without the required role to `/` |
| `RedirectIfAuth` | `router/guards.tsx` | Redirects logged-in users away from `/login` to `/` |

### Route table

| Path | Access | Page |
|------|--------|------|
| `/login` | Public (unauthenticated only) | `LoginPage` |
| `/` | All authenticated | `HomePage` |
| `/issues` | All authenticated | `IssueListPage` |
| `/issues/new` | All authenticated | `IssueCreatePage` |
| `/issues/:id` | All authenticated | `IssueDetailPage` |
| `/settings/password` | All authenticated | `PasswordPage` |
| `/admin/dashboard` | admin only | `DashboardPage` |
| `/admin/companies` | admin only | `CompanyListPage` |
| `/admin/companies/:id` | admin only | `CompanyDetailPage` |
| `/admin/products` | admin only | `ProductListPage` |
| `/admin/users` | admin only | `UserListPage` |
| `/admin/users/:id` | admin only | `UserDetailPage` |

---

## Pages

### Issue pages

**`IssueListPage`** — Paginated/infinite-scrolling table with debounced full-text search and filters for status, priority, type, and product. Filtering state lives in URL query params so bookmarking and sharing work. The list scope is automatically role-filtered by the API (clients see only their company's issues, engineers see their assigned products, admins see everything).

**`IssueDetailPage`** — Full issue view opened in a new tab. Displays issue metadata, an editable status/priority section (role-restricted), a combined activity feed (comments + field change history), file attachments, and quick-action buttons (Assign, Resolve). Internal comments are rendered with a visual distinction and are hidden from client users.

**`IssueCreatePage`** — Form with product selector, issue type, title, description, impact, and urgency. Priority is shown as a computed preview that updates as the user adjusts impact/urgency.

### Admin pages

**`DashboardPage`** — KPI summary cards (open issues, critical, SLA at risk, resolved this week) and breakdowns by status and priority. Data comes from `GET /api/issues/stats`.

**`CompanyDetailPage`** — Shows company info and its products. Allows editing company fields inline.

**`UserDetailPage`** — User profile with a product access management panel. Admins can grant and revoke an engineer's product access from this page.

---

## State Management

Two Zustand stores handle global client-side state. All server state is owned by TanStack Query.

### `auth.store.ts` — persisted to `localStorage`

```ts
{
  user: UserProfile | null
  isAuthenticated: boolean
  setUser(user: UserProfile): void
  clearAuth(): void
}
```

Populated on login and on app boot via `GET /api/auth/me`. Cleared on logout. `RequireAuth` reads `isAuthenticated` to decide whether to redirect.

### `tabs.store.ts` — persisted to `sessionStorage`

```ts
{
  tabs: AppTab[]          // array of open tabs
  activeId: string        // currently visible tab
  openTab(args): void     // opens a new tab or focuses an existing one
  closeTab(id): void      // removes a closeable tab
  setActive(id): void
  updateLabel(id, label): void   // used when issue detail loads its title
  updateMeta(id, meta): void     // stores status + priority for tab badge display
}
```

A permanent `Home` tab (id: `"home"`, not closeable) is always present. Issue detail pages open as closeable tabs. `AppShell` syncs the tab store with the current URL on every navigation.

---

## Data Fetching

All server state is managed by **TanStack Query v5**. Query keys are defined in a single factory object in [hooks/query-keys.ts](src/hooks/query-keys.ts) to keep invalidation predictable.

### Hook inventory

| Hook | Description |
|------|-------------|
| `useIssues` | Paginated issue list |
| `useInfiniteIssues` | Infinite-scroll variant (30 per page) |
| `useFeed` | Cursor-paginated activity + comment feed for an issue |
| `useIssue` | Single issue detail |
| `useIssueStats` | Dashboard KPIs |
| `useCreateIssue` | Mutation — invalidates all issue lists on success |
| `useUpdateIssue` | Mutation — invalidates the detail and all lists |
| `useAddComment` | Mutation — invalidates detail and resets feed queries |
| `useResolveIssue` | Mutation — invalidates the detail |
| `useAssignIssue` | Mutation — invalidates the detail and stats |
| `useCompanies` | Company list |
| `useCompany` | Single company detail |
| `useProducts` | Product list |
| `useUsers` | User list |
| `useUser` | Single user detail |
| `useEngineers` | Engineer list (for assignee dropdowns) |
| `useAuth` | Login and logout mutations |

Default `staleTime` is 30 seconds (configured in `lib/query-client.ts`).

---

## API Client

[`src/api/client.ts`](src/api/client.ts) exports a pre-configured Axios instance.

### Token storage

Both tokens are stored in `localStorage`:
- `access_token` — RS256 JWT, 15-minute TTL
- `refresh_token` — opaque token, 7-day TTL

### Interceptors

**Request interceptor** — Attaches `Authorization: Bearer <access_token>` to every request automatically.

**Response interceptor** — On a `401` response, silently calls `POST /api/auth/refresh` to rotate the token pair and retries the original request. If the refresh fails (expired or already consumed), both tokens are cleared and the user is redirected to `/login`. Concurrent requests that arrive during an in-progress refresh are queued and replayed with the new token.

### Exported helpers

```ts
setTokens(accessToken, refreshToken)  // called after login / register
clearTokens()                          // called on logout or refresh failure
```

---

## Component Library

UI primitives live in `src/components/ui/` and are based on **shadcn/ui** (Radix UI + Tailwind). They contain no business logic — only styling and accessibility.

| Component | Based on | Used for |
|-----------|----------|----------|
| `Avatar` | Radix Avatar | User initials / profile pictures |
| `Badge` | CVA | Status and priority chips |
| `Button` | Radix Slot + CVA | All clickable actions |
| `Card` | Div + Tailwind | Content panels |
| `DropdownMenu` | Radix Dropdown Menu | Action menus, user menu |
| `Input` | HTML input + Tailwind | Text inputs |
| `Label` | Radix Label | Form field labels |
| `NewnopLogo` | SVG | Branding in sidebar and login page |
| `Separator` | Radix Separator | Dividers |
| `Skeleton` | Div + Tailwind animate-pulse | Loading placeholders |
| `Tooltip` | Radix Tooltip | Hover hints on icon buttons |

Layout components (`AppShell`, `Header`, `Sidebar`) do contain business logic — they read auth state and tab state to render the correct navigation and tab bar.

---

## Key Design Decisions

**Tab-based navigation** — Issue detail pages open in closeable tabs (stored in `sessionStorage`). This allows engineers to work across multiple issues without losing context, matching the workflow pattern of tools like Linear.

**URL-driven filter state** — Issue list filters (status, priority, search, etc.) are stored in URL query params rather than component state. This makes filtered views bookmarkable and sharable, and means the browser back button restores the filter state naturally.

**Silent token refresh** — The Axios response interceptor handles `401` errors transparently. Components never need to check token expiry or trigger a refresh manually. Concurrent requests during a refresh are queued and replayed, not cancelled.

**Role-scoped data at the API layer** — The frontend does not filter data by role. It passes the user's token and the API returns only what that user can see. This avoids the risk of client-side filtering bugs exposing data.

**Lazy page loading** — All pages are loaded with `React.lazy` + `Suspense`. The initial JS bundle contains only the router and layout shell; page code downloads on first navigation to keep time-to-interactive low.

**Computed priority preview** — The issue create form shows a read-only priority badge that updates in real time as the user selects impact and urgency values. This makes the ITIL matrix tangible and prevents confusion about how priority is determined.
