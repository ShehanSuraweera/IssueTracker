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
│   ├── ai.ts               # AI suggestions, sentiment, similar issues, summaries, client health
│   ├── auth.ts
│   ├── companies.ts
│   ├── issues.ts
│   ├── products.ts
│   └── users.ts
├── components/
│   ├── ai/                 # AI panels (staff only, hidden when AI is off)
│   │   ├── ai-bits.tsx           # AiTag, Pill, FrustrationMeter shared bits
│   │   ├── AiSuggestionCard.tsx  # Triage suggestion: apply, edit or reject
│   │   ├── ClientMoodCard.tsx    # Sentiment and escalation risk across the thread
│   │   ├── SimilarIssuesCard.tsx # Similar resolved issues + cited suggested fix
│   │   ├── ThreadSummaryCard.tsx # Admin thread summary with cited key points
│   │   └── HighRiskIssuesCard.tsx # Dashboard list of high escalation-risk issues
│   ├── home/               # Home page sections
│   │   ├── HomeHero.tsx          # Welcome banner with role-aware message
│   │   ├── HomeKpis.tsx          # Summary KPI strip on the home page
│   │   ├── EngineerStats.tsx     # Engineer-specific workload stats
│   │   ├── MyWorkSection.tsx     # Issues assigned to the current user
│   │   └── home-columns.tsx      # Column definitions for the my-work table
│   ├── issue/              # Issue detail sub-components
│   │   ├── IssueHeader.tsx       # Title, ticket number, breadcrumb
│   │   ├── IssueSidebar.tsx      # Metadata panel (status, priority, assignee)
│   │   ├── IssueContextPanel.tsx # Collapsible context sidebar
│   │   ├── IssueForm.tsx         # Shared create/edit form fields
│   │   ├── IssueToolbar.tsx      # Action buttons (assign, resolve, delete)
│   │   └── issue-columns.tsx     # Column definitions for the issue list table
│   ├── issues/             # Shared issue widgets
│   │   ├── IssueTimeline.tsx     # Combined feed (comments + activity)
│   │   ├── ActivityPanel.tsx     # Activity log section
│   │   ├── ActivityRow.tsx       # Single activity entry
│   │   ├── CommentBubble.tsx     # Rendered comment (internal vs public)
│   │   ├── CommentComposer.tsx   # Rich text input for new comments
│   │   ├── MetaPanel.tsx         # Metadata edit panel (engineer/admin)
│   │   ├── RecordPanel.tsx       # Issue record display section
│   │   ├── AssignmentCard.tsx    # Assignee display + quick-assign UI
│   │   ├── AttachmentRow.tsx     # Single attachment with download link
│   │   └── AttachmentPreviewModal.tsx  # Lightbox for image attachments
│   ├── layout/
│   │   ├── AppShell.tsx    # Root layout: sidebar + header + <Outlet>; manages tab state
│   │   ├── Header.tsx      # Tab bar + user menu + logout
│   │   └── Sidebar.tsx     # Navigation links, role-filtered
│   └── ui/                 # shadcn/ui primitives + custom badges (no business logic)
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── confirm-dialog.tsx
│       ├── dashboard-charts.tsx
│       ├── data-table.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── impact-badge.tsx
│       ├── inline-confirm.tsx
│       ├── input.tsx
│       ├── kpi-card.tsx
│       ├── label.tsx
│       ├── newnop-logo.tsx
│       ├── priority-badge.tsx
│       ├── role-badge.tsx
│       ├── search-input.tsx
│       ├── separator.tsx
│       ├── skeleton.tsx
│       ├── sort-icon.tsx
│       ├── status-badge.tsx
│       └── tooltip.tsx
├── hooks/                  # TanStack Query wrappers — co-locate mutation + invalidation
│   ├── query-keys.ts              # Centralised key factory
│   ├── use-ai.ts                  # AI queries and mutations (all take an `enabled` flag)
│   ├── use-auth.ts
│   ├── use-back.ts                # Navigation back helper
│   ├── use-companies.ts
│   ├── use-debounce.ts            # Debounce value hook
│   ├── use-issue-list-state.ts    # URL-synced filter + sort state for issue list
│   ├── use-issues.ts
│   ├── use-products.ts
│   └── use-users.ts
├── lib/
│   ├── ai-display.ts       # Labels and colours for AI categories, teams, sentiment, risk
│   ├── format.ts           # Date, priority, and status formatting helpers
│   ├── issue-permissions.ts # Role-based permission flags for the current issue
│   ├── priority.ts         # ITIL impact × urgency matrix (UI preview copy)
│   ├── query-client.ts     # QueryClient singleton (staleTime: 30 s)
│   ├── schemas.ts          # Shared Zod schemas for form validation
│   ├── theme.ts            # Tailwind colour tokens for badges and charts
│   └── utils.ts            # cn() helper (clsx + tailwind-merge)
├── pages/
│   ├── HomePage.tsx              # Role-aware landing: KPIs + my-work table
│   ├── LoginPage.tsx             # Email + password login form
│   ├── RequestAccessPage.tsx     # Self-service registration for new client users
│   ├── NotFoundPage.tsx          # 404
│   ├── admin/
│   │   ├── DashboardPage.tsx     # KPI cards + charts (admin only)
│   │   ├── ClientHealthPage.tsx  # Sentiment trend per client company (admin, AI on)
│   │   ├── CompanyListPage.tsx   # Company management
│   │   ├── CompanyDetailPage.tsx # Company + its products
│   │   ├── ProductListPage.tsx   # Product management
│   │   ├── UserListPage.tsx      # User management
│   │   └── UserDetailPage.tsx    # User + product access grants
│   ├── issues/
│   │   ├── IssueListPage.tsx     # Filterable, searchable issue table with saved views
│   │   ├── IssueDetailPage.tsx   # Full issue view with timeline, comments, attachments
│   │   ├── IssueCreatePage.tsx   # New issue form
│   │   └── IssueEditPage.tsx     # Full edit form for an existing issue
│   └── settings/
│       ├── PasswordPage.tsx      # Change own password
│       └── ProfilePage.tsx       # View and edit own profile
├── router/
│   ├── index.tsx           # createBrowserRouter — all route definitions
│   └── guards.tsx          # RequireAuth, RequireRole, RedirectIfAuth
├── store/
│   ├── auth.store.ts       # Zustand: current user, persisted to localStorage
│   └── tabs.store.ts       # Zustand: open tabs, persisted to sessionStorage
└── types/                  # TypeScript interfaces mirroring API responses
    ├── ai.ts
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
| `/register` | Public (unauthenticated only) | `RequestAccessPage` |
| `/` | All authenticated | `HomePage` |
| `/issues` | All authenticated | `IssueListPage` |
| `/issues/new` | All authenticated | `IssueCreatePage` |
| `/issues/:id` | All authenticated | `IssueDetailPage` |
| `/issues/:id/edit` | All authenticated | `IssueEditPage` |
| `/settings/profile` | All authenticated | `ProfilePage` |
| `/settings/password` | All authenticated | `PasswordPage` |
| `/admin/dashboard` | admin only | `DashboardPage` |
| `/admin/client-health` | admin only (nav link shown only when AI is on) | `ClientHealthPage` |
| `/admin/companies` | admin only | `CompanyListPage` |
| `/admin/companies/:id` | admin only | `CompanyDetailPage` |
| `/admin/products` | admin only | `ProductListPage` |
| `/admin/users` | admin only | `UserListPage` |
| `/admin/users/:id` | admin only | `UserDetailPage` |

---

## Pages

### Issue pages

**`IssueListPage`** — Paginated/infinite-scrolling table with debounced full-text search and filters for status, priority, type, and product. Filtering state lives in URL query params so bookmarking and sharing work. Includes a **saved views** panel — users can pin a named filter preset and switch between them from the sidebar. The list scope is automatically role-filtered by the API (clients see only their company's issues, engineers see their assigned products, admins see everything).

**`IssueDetailPage`** — Full issue view opened in a new tab. Displays issue metadata, an editable status/priority section (role-restricted), a combined activity timeline (comments + field change history), file attachments, and quick-action buttons (Assign, Resolve, Delete). Internal comments are rendered with a visual distinction and are hidden from client users. Staff also see the AI panels described in [AI panels](#ai-panels).

**`IssueCreatePage`** — Form with product selector, issue type, title, description, impact, and urgency. Priority is shown as a computed preview that updates as the user adjusts impact/urgency.

**`IssueEditPage`** — Full edit form for an existing issue. Pre-populates all fields from the current issue data and submits a PATCH request on save.

### Admin pages

**`DashboardPage`** — KPI summary cards (open issues, critical, SLA at risk, resolved this week) and breakdowns by status and priority. Data comes from `GET /api/issues/stats`. When AI is on, a **High escalation risk** card lists open issues whose latest client message was rated high risk, with a link to Client Health.

**`ClientHealthPage`** — One card per client company with a trend pill (improving, stable, worsening, or not enough data), average frustration for the last 30 days and the 30 before, the count of open high-risk issues, and a weekly frustration chart. A 30/90/180-day range toggle. Data comes from `GET /api/ai/client-health`.

### AI panels

AI output is advisory and internal. The panels render only for engineers and admins, and only when `GET /api/ai/config` reports `enabled: true`. Clients never see them, and when the AI service is down each panel shows a short message while the rest of the page keeps working. Every panel carries a violet **AI** tag so generated text is never mistaken for a person's input.

| Panel | Who | What it does |
|-------|-----|--------------|
| `AiSuggestionCard` | Staff | Suggested impact, urgency, category and team, each with a reason. Staff can apply as is, change fields first, or reject. Shows the resulting priority (`Moderate → High`) before applying. Nothing changes until someone applies. Polls while analysis is running and offers a retry if it failed. |
| `ClientMoodCard` | Staff | Latest sentiment, escalation risk and frustration (1–5) with the quoted evidence, a sparkline across the thread and earlier readings. Never affects priority. |
| `SimilarIssuesCard` | Staff | Resolved issues from the same company with a match percentage, and an on-demand suggested fix whose steps cite those tickets. Helpful/not helpful feedback is stored to measure usefulness. |
| `ThreadSummaryCard` | Admin | On-demand summary, key points that cite the comments (`#2`) or the description they came from, and open questions. Marked stale when new comments arrive. |
| `HighRiskIssuesCard` | Staff | Dashboard and engineer home list of high escalation-risk issues. |

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
| `useInfiniteIssues` | Infinite-scroll variant (15 per page) |
| `useFeed` | Cursor-paginated activity + comment feed for an issue |
| `useIssue` | Single issue detail |
| `useIssueStats` | Dashboard KPIs |
| `useCreateIssue` | Mutation — invalidates all issue lists on success |
| `useUpdateIssue` | Mutation — invalidates the detail and all lists |
| `useDeleteIssue` | Mutation — admin-only cancel; invalidates all lists |
| `useAddComment` | Mutation — invalidates detail and resets feed queries |
| `useResolveIssue` | Mutation — invalidates the detail |
| `useAssignIssue` | Mutation — invalidates the detail and stats |
| `useSavedViews` | User's saved filter presets |
| `useCreateSavedView` | Mutation — creates a named saved view |
| `useRenameSavedView` | Mutation — renames a saved view |
| `useDeleteSavedView` | Mutation — deletes a saved view |
| `useUploadAttachments` | Mutation — presigns, uploads to S3, then confirms each file |
| `useCompanies` | Company list |
| `useCompany` | Single company detail |
| `useProducts` | Product list |
| `useUsers` | User list |
| `useUser` | Single user detail |
| `useEngineers` | Engineer list (for assignee dropdowns) |
| `useUpdateUser` | Mutation — updates user fields; invalidates list and detail |
| `useCreateUser` | Mutation — admin creates a user; invalidates list |
| `useRevokeProductAccess` | Mutation — revokes an engineer's product access |
| `useChangePassword` | Mutation — changes own password |
| `useAuth` | Login and logout mutations |
| `useAiEnabled` | Reads the AI feature flag (`/api/ai/config`, cached 5 min) |
| `useAiSuggestion` | Triage suggestion + analysis state; polls every 3 s while queued or running |
| `useReviewSuggestion` | Mutation — apply (optionally edited) or reject; invalidates the suggestion, detail and lists |
| `useRetryAnalysis` | Mutation — re-queues a failed analysis |
| `useSentimentTimeline` | Sentiment entries for an issue (refetches every 30 s) |
| `useSimilarIssues` | Similar resolved issues |
| `useResolution` / `useRequestResolution` / `useResolutionFeedback` | Latest suggested fix, request a new one, rate it |
| `useThreadSummary` / `useRequestThreadSummary` | Latest thread summary, request a new one (admin) |
| `useEscalations` | High escalation-risk issues |
| `useClientHealth` | Weekly sentiment trend per company |

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

**Saved views** — Users can pin any active filter combination as a named view. Views are persisted server-side (`saved_views` table) so they survive browser sessions and are consistent across devices. The sidebar renders the saved view list alongside standard navigation links.

**Silent token refresh** — The Axios response interceptor handles `401` errors transparently. Components never need to check token expiry or trigger a refresh manually. Concurrent requests during a refresh are queued and replayed, not cancelled.

**Role-scoped data at the API layer** — The frontend does not filter data by role. It passes the user's token and the API returns only what that user can see. This avoids the risk of client-side filtering bugs exposing data.

**Role-based permission flags** — `lib/issue-permissions.ts` (`getIssuePermissions`, a plain function rather than a hook) derives a set of boolean flags (`canEdit`, `canAssign`, `canResolve`, `canDelete`, `canComment`, `canPostInternal`) from the current user's role and the issue's ownership. Components read these flags rather than branching on role strings directly.

**Lazy page loading** — All pages are loaded with `React.lazy` + `Suspense`. The initial JS bundle contains only the router and layout shell; page code downloads on first navigation to keep time-to-interactive low.

**Computed priority preview** — The issue create and edit forms show a read-only priority badge that updates in real time as the user selects impact and urgency values. This makes the ITIL matrix tangible and prevents confusion about how priority is determined.

**AI is advisory, staff-only and optional** — Every AI hook takes an `enabled` flag and pages pass `false` for clients and when the flag is off, so clients only ever read the on/off flag and a disabled or failing AI service costs nothing but an empty panel. AI hooks use `retry: false` so an outage shows a message at once instead of spinning through retries.

**Review before apply** — The triage card never writes to the issue by itself. Staff see each suggested value with its reason and the priority it would produce, can change any field, and must click Apply. Whether a suggestion was accepted, edited or rejected is stored, which gives an honest acceptance rate.

**Sentiment never touches priority** — Priority comes only from the ITIL impact × urgency matrix. A frustrated client gets a visible signal for staff, not a higher place in the queue, so polite clients aren't penalised and priority can't be gamed by tone.
