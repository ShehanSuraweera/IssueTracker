import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ArrowRight, X } from "lucide-react";
import { useInfiniteIssues } from "@/hooks/use-issues";
import { useDebounce } from "@/hooks/use-debounce";
import { useTabsStore } from "@/store/tabs.store";
import { SearchInput } from "@/components/ui/search-input";
import { DataTable } from "@/components/ui/data-table";
import { relativeTime } from "@/lib/utils";
import { homeColumns } from "@/components/home/home-columns";
import type { IssueSummary, IssueStatus, PriorityLevel } from "@/types/issues";
import type { User } from "@/types/users";

interface MyWorkSectionProps {
  user: User | null;
  isEngineer: boolean;
  role: string;
  onRefresh: () => void;
}

const WORK_TITLE: Record<string, string> = {
  client_user: "My Issues",
  admin: "All Work",
};

const WORK_DESC: Record<string, string> = {
  client_user:
    "Track the issues you've submitted and follow up on their progress.",
  admin: "Overview of all active issues across the workspace.",
};

export function MyWorkSection({
  user,
  isEngineer,
  role,
  onRefresh,
}: MyWorkSectionProps) {
  const navigate = useNavigate();
  const { openTab } = useTabsStore();

  const [searchRaw, setSearch] = useState("");
  const [statusFilter, setStatus] = useState<IssueStatus | "">("");
  const [priorityFilter, setPriority] = useState<PriorityLevel | "">("");

  const debouncedSearch = useDebounce(searchRaw, 300);
  const hasFilters = !!debouncedSearch || !!statusFilter || !!priorityFilter;

  const baseQuery =
    isEngineer && user
      ? { assigned_to: user.id, sort: "updatedAt_desc" as const }
      : { sort: "updatedAt_desc" as const };

  const workQuery = {
    ...baseQuery,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
  };

  const {
    data,
    dataUpdatedAt,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteIssues(workQuery, debouncedSearch, {
    refetchInterval: 60_000,
  });

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );
  const totalCount = data?.pages[0]?.pagination.total ?? 0;

  const openIssue = (issue: IssueSummary) => {
    openTab({
      id: `issue:${issue.id}`,
      label: issue.ticketNumber,
      path: `/issues/${issue.id}`,
      meta: {
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
      },
    });
    navigate(`/issues/${issue.id}`);
  };

  const handleRefresh = () => {
    refetch();
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">
            {WORK_TITLE[role] ?? "My Work"}
          </h2>
          {totalCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </div>
        {dataUpdatedAt > 0 && (
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw
              className={`size-3 ${isFetching ? "animate-spin" : ""}`}
            />
            Last refreshed {relativeTime(dataUpdatedAt)}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {WORK_DESC[role] ??
          "Track your active tasks and stay on top of your queue."}
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SearchInput
          value={searchRaw}
          onChange={setSearch}
          placeholder="Search by title or ticket…"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatus(e.target.value as IssueStatus | "")}
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
          onChange={(e) => setPriority(e.target.value as PriorityLevel | "")}
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
            onClick={() => {
              setSearch("");
              setStatus("");
              setPriority("");
            }}
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
        emptyMessage={
          hasFilters ? "No issues match your filters." : "No active work items."
        }
        onLoadMore={fetchNextPage}
        hasMore={hasNextPage}
        isFetchingMore={isFetchingNextPage}
      />

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
  );
}
