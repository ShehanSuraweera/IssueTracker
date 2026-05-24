import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  useInfiniteIssues,
  useSavedViews,
  useCreateSavedView,
  useRenameSavedView,
  useDeleteSavedView,
} from "@/hooks/use-issues";
import { exportIssues } from "@/api/issues";
import { useAuth } from "@/hooks/use-auth";
import { useTabsStore } from "@/store/tabs.store";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  IssueSummary,
  ListIssuesQuery,
  IssueStatus,
  PriorityLevel,
  IssueType,
  SavedView,
} from "@/types/issues";

export type SortField    = "ticketNumber" | "title" | "status" | "priority" | "assignee" | "updatedAt";
export type SortDir      = "asc" | "desc";
export type ExtraFilters = { status?: IssueStatus; priority?: PriorityLevel; type?: IssueType };

export interface NavItem  { id: string; label: string; query: Partial<ListIssuesQuery> }
export interface NavGroup { label: string; items: NavItem[] }

export function useIssueListState() {
  const { hasRole, user } = useAuth();
  const navigate          = useNavigate();
  const location          = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openTab }       = useTabsStore();

  // ── State ──────────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("issues-sidebar-open") !== "false",
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"default" | "my">(() => {
    const view = searchParams.get("view") ?? "all";
    return view.startsWith("sv:") ? "my"
      : (localStorage.getItem("issues-active-tab") as "default" | "my") ?? "default";
  });
  const [activeViewId,    setActiveViewId]    = useState(() => searchParams.get("view") ?? "all");
  const [activeViewQuery, setActiveViewQuery] = useState<Partial<ListIssuesQuery>>({});
  const [activeViewLabel, setActiveViewLabel] = useState("All Issues");
  const [collapsed,       setCollapsed]       = useState<Set<string>>(new Set());
  const [pinned,          setPinned]          = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sidebar-pinned") ?? "[]")); }
    catch { return new Set(); }
  });
  const [search,    setSearch]    = useState(() => searchParams.get("q") ?? "");
  const [sortField, setSortField] = useState<SortField>(() => {
    const s = searchParams.get("sort") ?? "";
    const i = s.lastIndexOf("_");
    return (i !== -1 ? s.slice(0, i) : "updatedAt") as SortField;
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const s = searchParams.get("sort") ?? "";
    const i = s.lastIndexOf("_");
    return (i !== -1 ? s.slice(i + 1) : "desc") as SortDir;
  });
  const [groupBy,       setGroupBy]       = useState<string | null>(() => searchParams.get("group") ?? null);
  const [extraFilters,  setExtraFilters]  = useState<ExtraFilters>(() => {
    const f: ExtraFilters = {};
    const s = searchParams.get("status");
    const p = searchParams.get("priority");
    const t = searchParams.get("type");
    if (s) f.status   = s as IssueStatus;
    if (p) f.priority = p as PriorityLevel;
    if (t) f.type     = t as IssueType;
    return f;
  });
  const [isExporting,    setIsExporting]    = useState(false);
  const [saveViewOpen,   setSaveViewOpen]   = useState(false);
  const [saveViewName,   setSaveViewName]   = useState("");
  const [saveNameError,  setSaveNameError]  = useState("");
  const [renamingId,     setRenamingId]     = useState<string | null>(null);
  const [renameName,     setRenameName]     = useState("");
  const [renameError,    setRenameError]    = useState("");

  // ── Refs ───────────────────────────────────────────────────────────────────
  const sentinelRef    = useRef<HTMLDivElement>(null);
  const scrollRef      = useRef<HTMLDivElement>(null);
  const saveViewInputRef = useRef<HTMLInputElement>(null);

  // ── Saved views mutations ──────────────────────────────────────────────────
  const { data: savedViews = [], isLoading: savedViewsLoading } = useSavedViews();
  const createSavedViewMutation = useCreateSavedView();
  const renameSavedViewMutation = useRenameSavedView();
  const deleteSavedViewMutation = useDeleteSavedView();

  // ── Nav groups ─────────────────────────────────────────────────────────────
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
      items: user ? [
        { id: "my_assigned", label: "Assigned to Me", query: { assigned_to: user.id } },
        { id: "my_critical", label: "My Critical",    query: { assigned_to: user.id, priority: "critical" as const } },
        { id: "unassigned",  label: "Unassigned",     query: { unassigned: true } },
      ] : [],
    }] : []),
    ...(hasRole("admin") ? [{
      label: "Assignment",
      items: [{ id: "unassigned", label: "Unassigned", query: { unassigned: true } }],
    }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [user]);

  // ── Handlers (defined before effects that reference them) ──────────────────
  const selectView = (item: NavItem) => {
    setActiveViewId(item.id);
    setActiveViewQuery(item.query);
    setActiveViewLabel(item.label);
    setExtraFilters({});
    setMobileSidebarOpen(false);
  };

  const selectSavedView = (view: SavedView) => {
    const { search: savedSearch, sort: savedSort, ...filters } = view.query;
    setActiveViewId(`sv:${view.id}`);
    setActiveViewQuery(filters);
    setActiveViewLabel(view.name);
    setExtraFilters({});
    setSearch(savedSearch ?? "");
    if (savedSort) {
      const idx = savedSort.lastIndexOf("_");
      if (idx !== -1) {
        setSortField(savedSort.slice(0, idx) as SortField);
        setSortDir(savedSort.slice(idx + 1) as SortDir);
      }
    }
    setMobileSidebarOpen(false);
  };

  const deleteSavedView = (viewId: string) => {
    deleteSavedViewMutation.mutate(viewId, {
      onSuccess: () => {
        if (activeViewId === `sv:${viewId}`) {
          setActiveViewId("all");
          setActiveViewQuery({});
          setActiveViewLabel("All Issues");
          setActiveTab("default");
          setExtraFilters({});
          setSearch("");
        }
      },
    });
  };

  const toggleCollapse = (label: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  const togglePin = (label: string) =>
    setPinned(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      localStorage.setItem("sidebar-pinned", JSON.stringify([...next]));
      return next;
    });

  const cycleSort = (field: SortField) => {
    deactivateSavedView();
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const setExtraFilter = <K extends keyof ExtraFilters>(key: K, val: ExtraFilters[K]) => {
    deactivateSavedView();
    setExtraFilters(prev => {
      if (prev[key] === val) { const n = { ...prev }; delete n[key]; return n; }
      return { ...prev, [key]: val };
    });
  };

  const handleSearch = (q: string) => { deactivateSavedView(); setSearch(q); };
  const handleSetExtraFilters = (f: ExtraFilters) => { deactivateSavedView(); setExtraFilters(f); };
  const handleSetGroupBy = (g: string | null) => { deactivateSavedView(); setGroupBy(g); };

  const handleSaveView = () => {
    const name = saveViewName.trim();
    if (!name) return;
    if (savedViews.some(v => v.name.toLowerCase() === name.toLowerCase())) {
      setSaveNameError(`"${name}" already exists`);
      return;
    }
    setSaveNameError("");
    const query: Omit<ListIssuesQuery, "page" | "limit"> = { ...activeViewQuery };
    if (search) query.search = search;
    query.sort = `${sortField}_${sortDir}` as ListIssuesQuery["sort"];
    createSavedViewMutation.mutate(
      { name, query },
      {
        onSuccess: (created) => {
          setSaveViewOpen(false);
          setSaveViewName("");
          setActiveTab("my");
          setActiveViewId(`sv:${created.id}`);
          setActiveViewLabel(created.name);
        },
      },
    );
  };

  const commitRename = (viewId: string) => {
    const name = renameName.trim();
    if (!name) { setRenamingId(null); return; }
    if (savedViews.some(v => v.name.toLowerCase() === name.toLowerCase() && v.id !== viewId)) {
      setRenameError(`"${name}" already exists`);
      return;
    }
    renameSavedViewMutation.mutate(
      { id: viewId, name },
      {
        onSuccess: (updated) => {
          if (activeViewId === `sv:${viewId}`) setActiveViewLabel(updated.name);
          setRenamingId(null);
          setRenameError("");
        },
      },
    );
  };

  const handleExport = async (format: "csv" | "json") => {
    setIsExporting(true);
    try {
      const params = {
        ...(activeViewQuery.status     ? { status:     activeViewQuery.status     } : {}),
        ...(activeViewQuery.product_id ? { product_id: activeViewQuery.product_id } : {}),
      };
      const { blob, filename } = await exportIssues(format, params);
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const openIssue = (issue: IssueSummary) => {
    openTab({
      id:    `issue:${issue.id}`,
      label: issue.ticketNumber,
      path:  `/issues/${issue.id}`,
      meta:  { title: issue.title, status: issue.status, priority: issue.priority },
    });
    navigate(`/issues/${issue.id}`);
  };

  const openSidebarClose = () => {
    setSidebarOpen(false);
    setMobileSidebarOpen(false);
    localStorage.setItem("issues-sidebar-open", "false");
  };

  const openSidebarOpen = () => {
    setSidebarOpen(true);
    localStorage.setItem("issues-sidebar-open", "true");
  };

  const deactivateSavedView = () => {
    if (activeViewId.startsWith("sv:")) {
      setActiveViewId("all");
      setActiveViewLabel("All Issues");
    }
  };

  // ── Effects ────────────────────────────────────────────────────────────────
  const defaultViewRestored = useRef(false);
  useEffect(() => {
    const navItems = NAV_GROUPS.flatMap(g => g.items);
    const viewId = (location.state as { viewId?: string } | null)?.viewId;
    if (viewId) {
      const item = navItems.find(i => i.id === viewId);
      if (item) selectView(item);
      window.history.replaceState({}, "");
      defaultViewRestored.current = true;
      return;
    }
    if (!defaultViewRestored.current) {
      if (!activeViewId.startsWith("sv:") && activeViewId !== "all") {
        const item = navItems.find(i => i.id === activeViewId);
        if (item) {
          setActiveViewQuery(item.query);
          setActiveViewLabel(item.label);
        }
      }
      defaultViewRestored.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NAV_GROUPS]);

  const svRestoredRef = useRef(false);
  useEffect(() => {
    if (svRestoredRef.current || savedViewsLoading) return;
    if (!activeViewId.startsWith("sv:")) { svRestoredRef.current = true; return; }
    const view = savedViews.find(v => v.id === activeViewId.slice(3));
    if (view) {
      const { search: savedSearch, sort: savedSort, ...filters } = view.query;
      setActiveViewQuery(filters);
      setActiveViewLabel(view.name);
      if (savedSearch) setSearch(savedSearch);
      if (savedSort) {
        const idx = savedSort.lastIndexOf("_");
        if (idx !== -1) {
          setSortField(savedSort.slice(0, idx) as SortField);
          setSortDir(savedSort.slice(idx + 1) as SortDir);
        }
      }
    } else {
      setActiveViewId("all");
      setActiveViewLabel("All Issues");
    }
    svRestoredRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedViews, savedViewsLoading]);

  useEffect(() => { localStorage.setItem("issues-active-tab", activeTab); }, [activeTab]);

  useEffect(() => {
    if (saveViewOpen) saveViewInputRef.current?.focus();
  }, [saveViewOpen]);

  // ── Debounce + URL sync ────────────────────────────────────────────────────
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (activeViewId !== "all")       params.view     = activeViewId;
    if (debouncedSearch)              params.q        = debouncedSearch;
    const sortStr = `${sortField}_${sortDir}`;
    if (sortStr !== "updatedAt_desc") params.sort     = sortStr;
    if (groupBy)                      params.group    = groupBy;
    if (extraFilters.status)          params.status   = extraFilters.status;
    if (extraFilters.priority)        params.priority = extraFilters.priority;
    if (extraFilters.type)            params.type     = extraFilters.type;
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewId, debouncedSearch, sortField, sortDir, groupBy, extraFilters]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    dataUpdatedAt,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteIssues(
    { ...activeViewQuery, ...extraFilters, sort: `${sortField}_${sortDir}` as NonNullable<typeof activeViewQuery.sort> },
    debouncedSearch,
    { refetchInterval: 60_000 },
  );

  const currentParamKey = useMemo(
    () => JSON.stringify([activeViewQuery, extraFilters, sortField, sortDir, debouncedSearch]),
    [activeViewQuery, extraFilters, sortField, sortDir, debouncedSearch],
  );
  const dataParamKeyRef    = useRef("");
  const prevDataUpdatedRef = useRef(0);
  if (dataUpdatedAt !== prevDataUpdatedRef.current) {
    prevDataUpdatedRef.current = dataUpdatedAt;
    dataParamKeyRef.current    = currentParamKey;
  }

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [sortField, sortDir, groupBy, activeViewId, debouncedSearch]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const allItems = useMemo(() => data?.pages.flatMap(p => p.data) ?? [], [data]);

  const totalCount = data?.pages[0]?.pagination.total ?? 0;

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const g: Record<string, IssueSummary[]> = {};
    for (const issue of allItems) {
      const k =
        groupBy === "status"   ? issue.status   :
        groupBy === "priority" ? issue.priority  :
        groupBy === "product"  ? issue.product.name :
        (issue.assignee?.fullName ?? "Unassigned");
      (g[k] ??= []).push(issue);
    }
    return g;
  }, [allItems, groupBy]);

  const sortedGroups = useMemo(() => {
    const filtered = NAV_GROUPS.filter(g => g.items.length > 0);
    return [
      ...filtered.filter(g => pinned.has(g.label)),
      ...filtered.filter(g => !pinned.has(g.label)),
    ];
  }, [NAV_GROUPS, pinned]);

  const extraFilterCount = Object.values(extraFilters).filter(Boolean).length;

  return {
    // Auth
    hasRole,
    // Sidebar
    sidebarOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    openSidebarOpen,
    openSidebarClose,
    // Nav
    NAV_GROUPS,
    sortedGroups,
    activeTab,
    setActiveTab,
    activeViewId,
    activeViewLabel,
    collapsed,
    pinned,
    selectView,
    toggleCollapse,
    togglePin,
    // Saved views
    savedViews,
    savedViewsLoading,
    selectSavedView,
    deleteSavedView,
    renamingId,
    setRenamingId,
    renameName,
    setRenameName,
    renameError,
    setRenameError,
    commitRename,
    renameSavedViewMutation,
    deleteSavedViewMutation,
    // Save view form
    saveViewOpen,
    setSaveViewOpen,
    saveViewName,
    setSaveViewName,
    saveNameError,
    setSaveNameError,
    saveViewInputRef,
    handleSaveView,
    createSavedViewMutation,
    // Search + filters
    search,
    setSearch: handleSearch,
    extraFilters,
    setExtraFilters: handleSetExtraFilters,
    setExtraFilter,
    extraFilterCount,
    // Sort + group
    sortField,
    sortDir,
    cycleSort,
    groupBy,
    setGroupBy: handleSetGroupBy,
    // Data
    allItems,
    totalCount,
    grouped,
    isLoading,
    isFetching,
    isFetchingNextPage,
    dataUpdatedAt,
    debouncedSearch,
    currentParamKey,
    dataParamKeyRef,
    refetch,
    // DOM refs
    sentinelRef,
    scrollRef,
    // Navigation
    openIssue,
    // Export
    isExporting,
    handleExport,
  };
}
