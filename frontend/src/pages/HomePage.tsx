import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Plus, ArrowRight, X } from "lucide-react";
import { useInfiniteIssues, useIssueStats } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import { useTabsStore } from "@/store/tabs.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import type { IssueSummary, IssueStatus, PriorityLevel } from "@/types/issues";
import { relativeTime } from "@/lib/utils";
import { NewnopLogo } from "@/components/ui/newnop-logo";
import { DashboardCharts } from "@/components/ui/dashboard-charts";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@/components/ui/data-table";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slaInfo(deadline: string | null): { label: string; breached: boolean } {
  if (!deadline) return { label: "—", breached: false };
  const rem = new Date(deadline).getTime() - Date.now();
  if (rem <= 0) return { label: "Breached", breached: true };
  const d = Math.floor(rem / 86_400_000);
  const h = Math.floor((rem % 86_400_000) / 3_600_000);
  return { label: d > 0 ? `${d}d ${h}h` : `${h}h`, breached: false };
}

const homeColumns: ColumnDef<IssueSummary>[] = [
  {
    key: "ticketNumber",
    header: "Ticket",
    className: "whitespace-nowrap",
    render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ticketNumber}</span>,
  },
  {
    key: "title",
    header: "Title",
    className: "max-w-55",
    mobile: { primary: true },
    render: (row) => <span className="text-sm font-medium line-clamp-2">{row.title}</span>,
  },
  {
    key: "priority",
    header: "Priority",
    className: "whitespace-nowrap",
    render: (row) => <PriorityBadge priority={row.priority} />,
  },
  {
    key: "status",
    header: "State",
    className: "whitespace-nowrap",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "product",
    header: "Product",
    className: "whitespace-nowrap",
    render: (row) => <span className="text-xs text-muted-foreground">{row.product.name}</span>,
  },
  {
    key: "slaTimeLeft",
    header: "Actual time left",
    className: "whitespace-nowrap",
    render: (row) => {
      const sla = slaInfo(row.slaDeadline);
      return <span className={sla.breached ? "text-xs text-red-600 font-medium" : "text-xs text-muted-foreground"}>{sla.label}</span>;
    },
  },
  {
    key: "slaBreached",
    header: "Has breached",
    className: "whitespace-nowrap",
    mobile: { hidden: true },
    render: (row) => {
      const sla = slaInfo(row.slaDeadline);
      return sla.breached
        ? <span className="text-xs text-red-600 font-medium">Yes</span>
        : <span className="text-xs text-muted-foreground">No</span>;
    },
  },
  {
    key: "createdAt",
    header: "Created",
    className: "whitespace-nowrap",
    mobile: { hidden: true },
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    ),
  },
  {
    key: "updatedAt",
    header: "Updated",
    className: "whitespace-nowrap",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    ),
  },
];

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  accent = "default",
  onClick,
}: {
  label: string;
  value: number | undefined;
  accent?: "red" | "orange" | "default";
  onClick?: () => void;
}) {
  const numClass =
    accent === "red"    ? "text-red-600" :
    accent === "orange" ? "text-orange-500" :
    "text-foreground";

  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" : ""}
    >
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground font-medium mb-5">{label}</p>
        {value === undefined ? (
          <Skeleton className="h-10 w-14" />
        ) : (
          <p className={`text-5xl font-light tracking-tight ${numClass}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Engineer Swimlanes ───────────────────────────────────────────────────────

function EngineerStats({ stats }: { stats: ReturnType<typeof useIssueStats>["data"] }) {
  const navigate = useNavigate();
  const ev = stats?.engineerView;

  const tiles: {
    label: string;
    value: number | undefined;
    accent?: "red" | "orange" | "default";
    navViewId?: string;
    nav?: boolean;
  }[] = [
    { label: "My Open",            value: ev?.mine.open,             navViewId: "my_assigned" },
    { label: "My Critical",        value: ev?.mine.critical,         accent: "red",    navViewId: "my_critical" },
    { label: "Pending Breach",     value: ev?.mine.atSlaRisk,        accent: "orange" },
    { label: "Resolved This Week", value: ev?.mine.resolvedThisWeek },
    { label: "Unassigned",         value: ev?.unassigned.open,       navViewId: "unassigned" },
    { label: "All Resolved",       value: ev?.mine.resolvedAll },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(({ label, value, accent = "default", navViewId, nav }) => (
        <KpiTile
          key={label}
          label={label}
          value={value}
          accent={accent}
          onClick={
            navViewId ? () => navigate("/issues", { state: { viewId: navViewId } }) :
            nav       ? () => navigate("/issues") :
            undefined
          }
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { openTab } = useTabsStore();

  const [searchRaw,  setSearch]   = useState("");
  const [statusFilter,  setStatus]   = useState<IssueStatus | "">("");
  const [priorityFilter, setPriority] = useState<PriorityLevel | "">("");
  const debouncedSearch = useDebounce(searchRaw, 300);

  const hasFilters = !!debouncedSearch || !!statusFilter || !!priorityFilter;

  const { data: stats, refetch: refetchStats } = useIssueStats({ refetchInterval: 60_000 });


  const baseQuery = hasRole("engineer") && user
    ? { assigned_to: user.id, sort: "updatedAt_desc" as const }
    : { sort: "updatedAt_desc" as const };

  const workQuery = {
    ...baseQuery,
    ...(statusFilter   ? { status:   statusFilter   } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
  };

  const {
    data,
    dataUpdatedAt,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchWork,
  } = useInfiniteIssues(workQuery, debouncedSearch, { refetchInterval: 60_000 });

  const allItems   = useMemo(() => data?.pages.flatMap(p => p.data) ?? [], [data]);
  const totalCount = data?.pages[0]?.pagination.total ?? 0;

  const openIssue = (issue: IssueSummary) => {
    openTab({
      id:    `issue:${issue.id}`,
      label: issue.ticketNumber,
      path:  `/issues/${issue.id}`,
      meta:  { title: issue.title, status: issue.status, priority: issue.priority },
    });
    navigate(`/issues/${issue.id}`);
  };

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-7">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border bg-linear-to-br from-primary/12 to-transparent">
        {/* Brand green top accent bar */}
        <div className="absolute top-0 inset-x-0 h-0.75" style={{ backgroundColor: "var(--brand-green)" }} />
        <div className="relative flex items-center justify-between px-8 py-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-6 rounded-full" style={{ backgroundColor: "var(--brand-green)" }} />
              <span className="text-xs font-semibold tracking-widest uppercase text-primary">NewnopDesk</span>
            </div>
            <h1 className="text-2xl font-semibold">Hello, {firstName}!</h1>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Get a little help monitoring your work with your personal home page.
            </p>
          </div>
          <div className="relative hidden sm:flex items-center justify-center shrink-0 ml-8">
            <div
              className="absolute rounded-full blur-2xl"
              style={{ width: 90, height: 90, backgroundColor: "var(--brand-green)", opacity: 0.2 }}
            />
            <NewnopLogo width={100} height={87} className="relative select-none pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Important items ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold">Important items</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Check these metrics to see the most important items to work on.
        </p>
        {hasRole("engineer") ? (
          <EngineerStats stats={stats} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              label={hasRole("admin") ? "All Unassigned" : "Open"}
              value={hasRole("admin") ? stats?.adminView?.unassignedOpen : totalCount || undefined}
              onClick={() => navigate("/issues", { state: { viewId: "unassigned" } })}
            />
            <KpiTile
              label="Critical"
              value={stats?.summary.critical}
              accent="red"
              onClick={() => navigate("/issues", { state: { viewId: "p_critical" } })}
            />
            <KpiTile
              label="SLA At Risk"
              value={stats?.summary.atSlaRisk}
              accent="orange"
            />
            <KpiTile
              label="Resolved This Week"
              value={stats?.summary.resolvedThisWeek}
            />
            <KpiTile
              label="Total Open"
              value={stats?.summary.totalOpen}
            />
          </div>
        )}
      </div>

      {/* ── Charts ────────────────────────────────────────────────────── */}
      <DashboardCharts stats={stats} />

      {/* ── My Work ───────────────────────────────────────────────────── */}
      <div>
        {/* title row */}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {user?.role === "client_user" ? "My Issues" : user?.role === "admin" ? "All Work" : "My Work"}
            </h2>
            {totalCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {totalCount > 99 ? "99+" : totalCount}
              </span>
            )}
          </div>
          {dataUpdatedAt > 0 && (
            <button
              onClick={() => { refetchWork(); refetchStats(); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
              Last refreshed {relativeTime(dataUpdatedAt)}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {user?.role === "client_user"
            ? "Track the issues you've submitted and follow up on their progress."
            : user?.role === "admin"
            ? "Overview of all active issues across the workspace."
            : "Track your active tasks and stay on top of your queue."}
        </p>

        {/* filter bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <SearchInput
            value={searchRaw}
            onChange={setSearch}
            placeholder="Search by title or ticket…"
          />

          <select
            value={statusFilter}
            onChange={e => setStatus(e.target.value as IssueStatus | "")}
            className="h-7 rounded-md border border-input bg-background px-2 text-base sm:text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriority(e.target.value as PriorityLevel | "")}
            className="h-7 rounded-md border border-input bg-background px-2 text-base sm:text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setStatus(""); setPriority(""); }}
              className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>

        <DataTable
          columns={homeColumns}
          data={allItems}
          isLoading={!data}
          onRowClick={openIssue}
          emptyMessage={hasFilters ? "No issues match your filters." : "No active work items."}
          onLoadMore={fetchNextPage}
          hasMore={hasNextPage}
          isFetchingMore={isFetchingNextPage}
        />

        {/* view all link */}
        <div className="flex justify-end mt-2">
          <button
            onClick={() => navigate("/issues")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all in Issues
            <ArrowRight className="size-3" />
          </button>
        </div>
      </div>

      {/* ── FAB: New Task (client only) ───────────────────────────────── */}
      {hasRole("client_user") && (
        <button
          onClick={() => navigate("/issues/new")}
          title="New task"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl active:scale-95 transition-all"
        >
          <Plus className="size-6" />
        </button>
      )}
    </div>
  );
}
