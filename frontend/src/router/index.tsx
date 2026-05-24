import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequireRole, RedirectIfAuth } from "./guards";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Lazy page imports ────────────────────────────────────────────────────────

const LoginPage           = lazy(() => import("@/pages/LoginPage"));
const RequestAccessPage   = lazy(() => import("@/pages/RequestAccessPage"));
const HomePage          = lazy(() => import("@/pages/HomePage"));
const IssueListPage     = lazy(() => import("@/pages/issues/IssueListPage"));
const IssueDetailPage   = lazy(() => import("@/pages/issues/IssueDetailPage"));
const IssueCreatePage   = lazy(() => import("@/pages/issues/IssueCreatePage"));
const IssueEditPage     = lazy(() => import("@/pages/issues/IssueEditPage"));
const DashboardPage     = lazy(() => import("@/pages/admin/DashboardPage"));
const CompanyListPage   = lazy(() => import("@/pages/admin/CompanyListPage"));
const CompanyDetailPage = lazy(() => import("@/pages/admin/CompanyDetailPage"));
const ProductListPage   = lazy(() => import("@/pages/admin/ProductListPage"));
const UserListPage      = lazy(() => import("@/pages/admin/UserListPage"));
const UserDetailPage    = lazy(() => import("@/pages/admin/UserDetailPage"));
const PasswordPage      = lazy(() => import("@/pages/settings/PasswordPage"));
const ProfilePage       = lazy(() => import("@/pages/settings/ProfilePage"));
const NotFoundPage      = lazy(() => import("@/pages/NotFoundPage"));

function PageLoader() {
  return (
    <div className="space-y-3 p-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function wrap(element: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  // Public routes
  {
    element: <RedirectIfAuth />,
    children: [
      { path: "/login",    element: wrap(<LoginPage />) },
      { path: "/register", element: wrap(<RequestAccessPage />) },
    ],
  },

  // Protected routes (all authenticated users)
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true,          element: wrap(<HomePage />) },
          { path: "/issues",      element: wrap(<IssueListPage />) },
          { path: "/issues/new",      element: wrap(<IssueCreatePage />) },
          { path: "/issues/:id",      element: wrap(<IssueDetailPage />) },
          { path: "/issues/:id/edit", element: wrap(<IssueEditPage />) },

          { path: "/settings/profile",  element: wrap(<ProfilePage />) },
          { path: "/settings/password", element: wrap(<PasswordPage />) },

          // Admin-only routes
          {
            element: <RequireRole roles={["admin"]} />,
            children: [
              { path: "/admin/dashboard",       element: wrap(<DashboardPage />) },
              { path: "/admin/companies",        element: wrap(<CompanyListPage />) },
              { path: "/admin/companies/:id",    element: wrap(<CompanyDetailPage />) },
              { path: "/admin/products",         element: wrap(<ProductListPage />) },
              { path: "/admin/users",            element: wrap(<UserListPage />) },
              { path: "/admin/users/:id",        element: wrap(<UserDetailPage />) },
            ],
          },
        ],
      },
    ],
  },

  // 404
  { path: "*", element: wrap(<NotFoundPage />) },
]);
