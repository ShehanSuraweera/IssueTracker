import type { RefObject } from "react";
import {
  ArrowUpDown,
  Bookmark,
  Check,
  Filter,
  Layers,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  SortField,
  SortDir,
  ExtraFilters,
} from "@/hooks/use-issue-list-state";
import type { IssueStatus, PriorityLevel, IssueType } from "@/types/issues";

interface Props {
  search: string;
  setSearch: (v: string) => void;
  extraFilters: ExtraFilters;
  setExtraFilter: <K extends keyof ExtraFilters>(
    key: K,
    val: ExtraFilters[K],
  ) => void;
  setExtraFilters: (f: ExtraFilters) => void;
  extraFilterCount: number;
  sortField: SortField;
  sortDir: SortDir;
  cycleSort: (field: SortField) => void;
  groupBy: string | null;
  setGroupBy: (g: string | null) => void;
  activeViewId: string;
  activeViewLabel: string;
  saveViewOpen: boolean;
  setSaveViewOpen: (open: boolean) => void;
  saveViewName: string;
  setSaveViewName: (name: string) => void;
  saveNameError: string;
  setSaveNameError: (err: string) => void;
  saveViewInputRef: RefObject<HTMLInputElement | null>;
  handleSaveView: () => void;
  createSavedViewMutation: { isPending: boolean };
  deleteSavedView: (id: string) => void;
  deleteSavedViewMutation: { isPending: boolean };
}

const STATUS_OPTIONS: IssueStatus[] = [
  "new",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "cancelled",
];
const PRIORITY_OPTIONS: PriorityLevel[] = [
  "critical",
  "high",
  "moderate",
  "low",
];
const TYPE_OPTIONS: IssueType[] = [
  "bug",
  "feature_request",
  "question",
  "incident",
];
const SORT_OPTIONS: { f: SortField; l: string }[] = [
  { f: "updatedAt", l: "Updated" },
  { f: "priority", l: "Priority" },
  { f: "status", l: "State" },
  { f: "ticketNumber", l: "Number" },
  { f: "title", l: "Description" },
  { f: "assignee", l: "Assigned to" },
];

export function IssueToolbar({
  search,
  setSearch,
  extraFilters,
  setExtraFilter,
  setExtraFilters,
  extraFilterCount,
  sortField,
  sortDir,
  cycleSort,
  groupBy,
  setGroupBy,
  activeViewId,
  activeViewLabel,
  saveViewOpen,
  setSaveViewOpen,
  saveViewName,
  setSaveViewName,
  saveNameError,
  setSaveNameError,
  saveViewInputRef,
  handleSaveView,
  createSavedViewMutation,
  deleteSavedView,
  deleteSavedViewMutation,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-2 border-b bg-background shrink-0">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search issues…"
      />

      <div className="flex items-center gap-1.5 overflow-x-auto justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 text-xs gap-1.5",
                extraFilterCount > 0 && "border-primary text-primary",
              )}
            >
              <Filter className="size-3.5" />
              <span className="hidden sm:inline">
                Filter{extraFilterCount > 0 && ` (${extraFilterCount})`}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs py-1.5">
              Status
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_OPTIONS.map((st) => (
              <DropdownMenuItem
                key={st}
                onClick={() => setExtraFilter("status", st)}
                className="justify-between text-xs"
              >
                <span className="capitalize">{st.replace(/_/g, " ")}</span>
                {extraFilters.status === st && (
                  <Check className="size-3 ml-2" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs py-1.5">
              Priority
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRIORITY_OPTIONS.map((p) => (
              <DropdownMenuItem
                key={p}
                onClick={() => setExtraFilter("priority", p)}
                className="justify-between text-xs capitalize"
              >
                {p}
                {extraFilters.priority === p && (
                  <Check className="size-3 ml-2" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs py-1.5">
              Type
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TYPE_OPTIONS.map((t) => (
              <DropdownMenuItem
                key={t}
                onClick={() => setExtraFilter("type", t)}
                className="justify-between text-xs"
              >
                <span className="capitalize">{t.replace(/_/g, " ")}</span>
                {extraFilters.type === t && <Check className="size-3 ml-2" />}
              </DropdownMenuItem>
            ))}
            {extraFilterCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setExtraFilters({})}
                  className="text-xs text-destructive justify-center"
                >
                  Clear filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {extraFilters.status && (
          <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 h-7 text-xs text-primary">
            <span className="capitalize">
              {extraFilters.status.replace(/_/g, " ")}
            </span>
            <button
              onClick={() => setExtraFilter("status", extraFilters.status)}
              className="hover:text-destructive transition-colors"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        {extraFilters.priority && (
          <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 h-7 text-xs text-primary capitalize">
            {extraFilters.priority}
            <button
              onClick={() => setExtraFilter("priority", extraFilters.priority)}
              className="hover:text-destructive transition-colors"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        {extraFilters.type && (
          <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 h-7 text-xs text-primary">
            <span className="capitalize">
              {extraFilters.type.replace(/_/g, " ")}
            </span>
            <button
              onClick={() => setExtraFilter("type", extraFilters.type)}
              className="hover:text-destructive transition-colors"
            >
              <X className="size-3" />
            </button>
          </span>
        )}

        {(extraFilterCount > 0 || !!search) && (
          <button
            onClick={() => {
              setExtraFilters({});
              setSearch("");
            }}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="size-3" />
            Clear all
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <ArrowUpDown className="size-3.5" />
              <span className="hidden sm:inline">Sort by</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-xs py-1.5">
              Sort by
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SORT_OPTIONS.map(({ f, l }) => (
              <DropdownMenuItem
                key={f}
                onClick={() => cycleSort(f)}
                className="justify-between text-xs"
              >
                {l}
                {sortField === f && (
                  <span className="text-muted-foreground ml-2">
                    {sortDir === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <div className="flex items-center">
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 text-xs gap-1.5",
                  groupBy && "rounded-r-none border-r-0",
                )}
              >
                <Layers className="size-3.5" />
                <span className="hidden sm:inline">
                  Group by
                  {groupBy && (
                    <span className="text-muted-foreground capitalize ml-0.5">
                      {" "}
                      ({groupBy})
                    </span>
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
            {groupBy && (
              <button
                onClick={() => setGroupBy(null)}
                className="h-7 px-1.5 border border-l-0 rounded-r-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Clear grouping"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel className="text-xs py-1.5">
              Group by
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setGroupBy(null)}
              className="justify-between text-xs"
            >
              None {!groupBy && "✓"}
            </DropdownMenuItem>
            {["status", "priority", "product", "assignee"].map((f) => (
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

        {saveViewOpen ? (
          <div className="flex items-center gap-1">
            <div className="flex flex-col">
              <input
                ref={saveViewInputRef}
                value={saveViewName}
                onChange={(e) => {
                  setSaveViewName(e.target.value);
                  setSaveNameError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveView();
                  if (e.key === "Escape") {
                    setSaveViewOpen(false);
                    setSaveViewName("");
                    setSaveNameError("");
                  }
                }}
                placeholder="Name this view…"
                className={cn(
                  "h-7 w-36 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring",
                  saveNameError
                    ? "border-destructive focus:ring-destructive"
                    : "border-input",
                )}
              />
              {saveNameError && (
                <span className="mt-0.5 text-[10px] text-destructive">
                  {saveNameError}
                </span>
              )}
            </div>
            <Button
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleSaveView}
              disabled={
                !saveViewName.trim() || createSavedViewMutation.isPending
              }
            >
              {createSavedViewMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                setSaveViewOpen(false);
                setSaveViewName("");
                setSaveNameError("");
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : activeViewId.startsWith("sv:") ? (
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                title="Remove this saved view"
              >
                <Bookmark className="size-3.5 fill-current" />
                <span className="hidden sm:inline">Unsave view</span>
              </Button>
            }
            title="Remove saved view?"
            description={`"${activeViewLabel}" will be permanently removed from your saved views.`}
            confirmLabel="Remove"
            variant="destructive"
            isPending={deleteSavedViewMutation.isPending}
            onConfirm={() => deleteSavedView(activeViewId.slice(3))}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setSaveViewOpen(true)}
            title="Save current view to My lists"
          >
            <Bookmark className="size-3.5" />
            <span className="hidden sm:inline">Save view</span>
          </Button>
        )}
      </div>
    </div>
  );
}
