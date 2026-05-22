import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Plus, Filter, RefreshCw, Download,
  ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Layers,
  PanelLeftClose, PanelLeftOpen, Loader2,
} from "lucide-react";
import { useInfiniteIssues } from "@/hooks/use-issues";
import { relativeTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTabsStore } from "@/store/tabs.store";
import { useDebounce } from "@/hooks/use-debounce";
import type { IssueSummary, ListIssuesQuery, PriorityLevel } from "@/types/issues";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { ImpactBadge } from "@/components/ui/impact-badge";
import { SearchInput } from "@/components/ui/search-input";

type SortField = "ticketNumber" | "title" | "status" | "priority" | "assignee" | "updatedAt";
type SortDir   = "asc" | "desc";

interface NavItem { id: string; label: string; query: Partial<ListIssuesQuery> }
interface NavGroup { label: string; items: NavItem[] }

const COLS: Array<{ key: SortField | null; label: string; cls?: string }> = [
  { key: "ticketNumber", label: "Number",            cls: "w-32" },
  { key: "title",        label: "Short description", cls: "min-w-[220px]" },
  { key: null,           label: "Type",              cls: "w-28" },
  { key: null,           label: "Product",           cls: "w-32" },
  { key: "status",       label: "State",             cls: "w-28" },
  { key: "priority",     label: "Priority",          cls: "w-24" },
  { key: null,           label: "Impact",            cls: "w-24" },
  { key: "assignee",     label: "Assigned to",       cls: "w-36" },
  { key: "updatedAt",    label: "Updated",           cls: "w-32" },
];

export default function IssueListPage() {
  const { hasRole, user } = useAuth();
  const navigate          = useNavigate();
  const location          = useLocation();
  const { openTab }       = useTabsStore();

  const NAV_GROUPS = useMemo<NavGroup[]>(() => [
    {
      label: "Issues",
      items: [
        { id: "all",         label: "All Issues",  query: {} },
        { id: "new",         label: "New",         query: { status: "new" } },
        { id: "in_progress", label: "In Progress", query: { status: "in_progress" } },
        { id: "on_hold",     label: "On Hold",     query: { status: "on_hold" } },
        { id: "resolved",    label: "Resolved",    query: { status: "resolved" } },
        { id: "closed",      label: "Closed",      query: { status: "closed" } },
        { id: "cancelled",   label: "Cancelled",   query: { status: "cancelled" } },
      ],
    },
    {
      label: "Priority",
      items: [
        { id: "p_critical", label: "Critical", query: { priority: "critical" } },
        { id: "p_high",     label: "High",     query: { priority: "high" } },
        { id: "p_moderate", label: "Moderate", query: { priority: "moderate" } },
        { id: "p_low",      label: "Low",      query: { priority: "low" } },
      ],
    },
    ...(hasRole("engineer") ? [{
      label: "My Work",
      items: user
        ? [
            { id: "my_assigned", label: "Assigned to Me",  query: { assigned_to: user.id } },
            { id: "my_critical", label: "My Critical",     query: { assigned_to: user.id, priority: "critical" as const } },
            { id: "unassigned",  label: "Unassigned",      query: { unassigned: true } },
          ]
        : [],
    }] : []),
    ...(hasRole("admin") ? [{
      label: "Assignment",
      items: [
        { id: "unassigned", label: "Unassigned", query: { unassigned: true } },
      ],
    }] : []),
  ], [user]);

  // Activate a view passed via navigation state (e.g. from homepage "My Open" tile)
  useEffect(() => {
    const viewId = (location.state as { viewId?: string } | null)?.viewId;
    if (!viewId) return;
    const item = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === viewId);
    if (item) selectView(item);
    // Clear the state so a manual refresh doesn't re-apply it
    window.history.replaceState({}, "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NAV_GROUPS]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const [sidebarOpen,     setSidebarOpen]     = useState(true);
  const [activeViewId,    setActiveViewId]    = useState("all");
  const [activeViewQuery, setActiveViewQuery] = useState<Partial<ListIssuesQuery>>({});
  const [activeViewLabel, setActiveViewLabel] = useState("All Issues");
  const [collapsed,       setCollapsed]       = useState<Set<string>>(new Set());
  const [search,          setSearch]          = useState("");
  const [sortField,       setSortField]       = useState<SortField>("updatedAt");
  const [sortDir,         setSortDir]         = useState<SortDir>("desc");
  const [groupBy,         setGroupBy]         = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    dataUpdatedAt,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteIssues(activeViewQuery, debouncedSearch, { refetchInterval: 60_000 });

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchNextPage(); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const allItems = useMemo(
    () => data?.pages.flatMap(p => p.data) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.pagination.total ?? 0;

  const sortedData = useMemo(() => {
    const PRIO: Record<PriorityLevel, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
    return [...allItems].sort((a, b) => {
      let cmp = 0;
      if      (sortField === "ticketNumber") cmp = a.ticketNumber.localeCompare(b.ticketNumber);
      else if (sortField === "title")        cmp = a.title.localeCompare(b.title);
      else if (sortField === "status")       cmp = a.status.localeCompare(b.status);
      else if (sortField === "priority")     cmp = PRIO[a.priority] - PRIO[b.priority];
      else if (sortField === "assignee")     cmp = (a.assignee?.fullName ?? "zzz").localeCompare(b.assignee?.fullName ?? "zzz");
      else                                   cmp = a.updatedAt.localeCompare(b.updatedAt);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allItems, sortField, sortDir]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const g: Record<string, IssueSummary[]> = {};
    for (const issue of sortedData) {
      const k =
        groupBy === "status"   ? issue.status :
        groupBy === "priority" ? issue.priority :
        groupBy === "product"  ? issue.product.name :
        (issue.assignee?.fullName ?? "Unassigned");
      (g[k] ??= []).push(issue);
    }
    return g;
  }, [sortedData, groupBy]);

  const openIssue = (issue: IssueSummary) => {
    openTab({
      id:    `issue:${issue.id}`,
      label: issue.ticketNumber,
      path:  `/issues/${issue.id}`,
      meta:  { title: issue.title, status: issue.status, priority: issue.priority },
    });
    navigate(`/issues/${issue.id}`);
  };

  const selectView = (item: NavItem) => {
    setActiveViewId(item.id);
    setActiveViewQuery(item.query);
    setActiveViewLabel(item.label);
  };

  const toggleCollapse = (label: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const cycleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="size-3 opacity-20 ml-1 shrink-0" />;
    return sortDir === "asc"
      ? <ArrowUp   className="size-3 text-primary ml-1 shrink-0" />
      : <ArrowDown className="size-3 text-primary ml-1 shrink-0" />;
  };

  const filterCount = [search, activeViewQuery.status, activeViewQuery.priority, activeViewQuery.assigned_to]
    .filter(Boolean).length;

  const renderRow = (issue: IssueSummary) => (
    <tr
      key={issue.id}
      onClick={() => openIssue(issue)}
      className="border-b cursor-pointer hover:bg-muted/40 transition-colors group"
    >
      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
        {issue.ticketNumber}
      </td>
      <td className="px-4 py-2.5 text-sm font-medium max-w-xs">
        <span className="line-clamp-1 group-hover:text-primary transition-colors">{issue.title}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize whitespace-nowrap">
        {issue.type.replace(/_/g, " ")}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {issue.product.name}
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={issue.status} />
      </td>
      <td className="px-4 py-2.5">
        <PriorityBadge priority={issue.priority} />
      </td>
      <td className="px-4 py-2.5">
        <ImpactBadge impact={issue.impact} />
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {issue.assignee?.fullName ?? <em className="not-italic text-muted-foreground/40">Unassigned</em>}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(issue.updatedAt).toLocaleDateString()}
      </td>
    </tr>
  );

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Left secondary sidebar ──────────────────────────── */}
      <aside className={cn(
        "border-r bg-muted/20 flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
        sidebarOpen ? "w-56" : "w-0 border-r-0",
      )}>
        {/* Tabs */}
        <div className="flex border-b shrink-0 min-w-56">
          <button className="flex-1 py-2.5 text-xs font-medium text-primary border-b-2 border-primary bg-background/60">
            Default lists
          </button>
          <button className="flex-1 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            My lists
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="px-2.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        </div>
        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.filter(g => g.items.length > 0).map(group => {
            const isCollapsed = collapsed.has(group.label);
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleCollapse(group.label)}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight className="size-3 shrink-0" />
                    : <ChevronDown  className="size-3 shrink-0" />
                  }
                  {group.label}
                </button>
                {!isCollapsed && group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => selectView(item)}
                    className={cn(
                      "flex w-full items-center pl-6 pr-3 py-1.5 text-sm transition-colors text-left",
                      activeViewId === item.id
                        ? "bg-primary/90 text-primary-foreground font-medium"
                        : "text-foreground/80 hover:bg-primary/10 hover:text-primary",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="size-3.5" />
              </button>
            )}
            <h1 className="text-sm font-semibold truncate">
              Issues — {activeViewLabel}
            </h1>
            {totalCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                {totalCount}
              </span>
            )}
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground hidden md:block whitespace-nowrap">
                Last refreshed {relativeTime(dataUpdatedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Download className="size-3.5 mr-1.5" />
              Export
            </Button>
            {!hasRole("engineer") && (
              <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/issues/new")}>
                <Plus className="size-3.5 mr-1" />
                New
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-b bg-background shrink-0 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search issues…"
          />

          {filterCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 h-7 text-xs text-muted-foreground">
              <Filter className="size-3" />
              {filterCount} {filterCount === 1 ? "condition" : "conditions"}
            </span>
          )}

          {/* Sort by */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <ArrowUpDown className="size-3.5" />
                Sort by
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="text-xs py-1.5">Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {([
                { f: "updatedAt"    as SortField, l: "Updated" },
                { f: "priority"     as SortField, l: "Priority" },
                { f: "status"       as SortField, l: "State" },
                { f: "ticketNumber" as SortField, l: "Number" },
                { f: "title"        as SortField, l: "Description" },
                { f: "assignee"     as SortField, l: "Assigned to" },
              ]).map(({ f, l }) => (
                <DropdownMenuItem key={f} onClick={() => cycleSort(f)} className="justify-between text-xs">
                  {l}
                  {sortField === f && (
                    <span className="text-muted-foreground ml-2">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Group by */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <Layers className="size-3.5" />
                Group by
                {groupBy && (
                  <span className="text-muted-foreground capitalize ml-0.5">({groupBy})</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuLabel className="text-xs py-1.5">Group by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setGroupBy(null)} className="justify-between text-xs">
                None {!groupBy && "✓"}
              </DropdownMenuItem>
              {["status", "priority", "product", "assignee"].map(f => (
                <DropdownMenuItem
                  key={f}
                  onClick={() => setGroupBy(f)}
                  className="justify-between text-xs capitalize"
                >
                  {f} {groupBy === f && "✓"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <table className="w-full border-collapse min-w-190">
              <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
                <tr className="border-b">
                  {COLS.map(col => (
                    <th
                      key={col.label}
                      className={cn(
                        "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap",
                        col.cls,
                        col.key && "cursor-pointer select-none hover:text-foreground",
                      )}
                      onClick={() => col.key && cycleSort(col.key)}
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {col.key && <SortIcon field={col.key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? Object.entries(grouped).flatMap(([gk, issues]) => [
                      <tr key={`g-${gk}`} className="border-b bg-muted/30">
                        <td colSpan={COLS.length} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {gk}
                          <span className="ml-1.5 font-normal normal-case opacity-70">({issues.length})</span>
                        </td>
                      </tr>,
                      ...issues.map(renderRow),
                    ])
                  : sortedData.map(renderRow)
                }
                {sortedData.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="py-16 text-center text-sm text-muted-foreground">
                      No issues found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Infinite scroll sentinel + loading indicator */}
        <div className="shrink-0">
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-3 border-t">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <div ref={sentinelRef} className="h-1" />
        </div>
      </div>
    </div>
  );
}
