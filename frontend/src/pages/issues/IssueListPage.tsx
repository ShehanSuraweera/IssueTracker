import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useIssues } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import type { ListIssuesQuery, PriorityLevel, IssueStatus } from "@/types/issues";

const PRIORITY_STYLES: Record<PriorityLevel, string> = {
  low:      "bg-slate-100 text-slate-700 border-slate-200",
  moderate: "bg-blue-100 text-blue-700 border-blue-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_STYLES: Record<IssueStatus, string> = {
  new:         "bg-purple-100 text-purple-700",
  in_progress: "bg-blue-100 text-blue-700",
  on_hold:     "bg-yellow-100 text-yellow-700",
  resolved:    "bg-green-100 text-green-700",
  closed:      "bg-gray-100 text-gray-600",
  cancelled:   "bg-red-100 text-red-700",
};

export default function IssueListPage() {
  const { hasRole } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<ListIssuesQuery>({ page: 1, limit: 20 });

  const { data, isLoading } = useIssues(query, search);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Issues</h1>
          {data && (
            <p className="text-sm text-muted-foreground">{data.pagination.total} total</p>
          )}
        </div>
        {!hasRole("engineer") && (
          <Button asChild size="sm">
            <Link to="/issues/new">
              <Plus className="mr-1.5 size-4" />
              New issue
            </Link>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search tickets, titles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.data.map((issue) => (
            <Card key={issue.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {issue.ticketNumber}
                    </span>
                    <Badge
                      className={`text-xs border ${PRIORITY_STYLES[issue.priority]}`}
                      variant="outline"
                    >
                      {issue.priority}
                    </Badge>
                    <Badge className={`text-xs ${STATUS_STYLES[issue.status]}`} variant="outline">
                      {issue.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <Link
                    to={`/issues/${issue.id}`}
                    className="font-medium hover:text-primary truncate block"
                  >
                    {issue.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {issue.product.name} · {issue.creator.fullName} ·{" "}
                    {new Date(issue.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right shrink-0 text-xs text-muted-foreground">
                  {issue.assignee ? (
                    <span>{issue.assignee.fullName}</span>
                  ) : (
                    <span className="text-muted-foreground/50">Unassigned</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {data?.data.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No issues found.</div>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={query.page === 1}
            onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {query.page} / {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={query.page === data.pagination.totalPages}
            onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
