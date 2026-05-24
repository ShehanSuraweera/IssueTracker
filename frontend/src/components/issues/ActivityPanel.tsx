import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, X, Search, ArrowUpDown, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { dayKey } from "@/lib/format";
import { useFeed } from "@/hooks/use-issues";
import { CommentComposer } from "./CommentComposer";
import { CommentBubble } from "./CommentBubble";
import { ActivityRow } from "./ActivityRow";
import { AttachmentRow } from "./AttachmentRow";
import type { FeedItem, FeedFilter, Comment, Activity } from "@/types/issues";

type ActGroup = "day" | "type" | "user" | "none";
type ActSort = "desc" | "asc";

const GROUP_LABELS: Record<ActGroup, string> = {
  day: "By day",
  type: "By type",
  user: "By user",
  none: "None",
};

const PANEL_BORDER = "color-mix(in srgb, var(--brand-green) 30%, transparent)";

interface ActivityPanelProps {
  issueId: string;
  canComment: boolean;
  canInternal: boolean;
  currentUserId?: string;
}

export function ActivityPanel({
  issueId,
  canComment,
  canInternal,
  currentUserId,
}: ActivityPanelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [filter, setFilter] = useState<FeedFilter>("all");
  const [actSearch, setSearch] = useState("");
  const [actSort, setSort] = useState<ActSort>("desc");
  const [actGroup, setGroup] = useState<ActGroup>("day");

  const {
    data: feedData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useFeed(issueId, filter);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchNextPage();
      },
      { threshold: 0.1, root },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const allItems = useMemo<FeedItem[]>(
    () => feedData?.pages.flatMap((p) => p.data) ?? [],
    [feedData],
  );

  const displayItems = useMemo<FeedItem[]>(() => {
    let items = allItems;
    if (actSearch.trim()) {
      const q = actSearch.toLowerCase();
      items = items.filter((item) => {
        if (item.kind === "comment")
          return (
            item.body.toLowerCase().includes(q) ||
            item.user.fullName.toLowerCase().includes(q)
          );
        if (item.kind === "activity")
          return (
            item.fieldName.toLowerCase().includes(q) ||
            (item.newValue ?? "").toLowerCase().includes(q) ||
            (item.oldValue ?? "").toLowerCase().includes(q) ||
            item.user.fullName.toLowerCase().includes(q)
          );
        if (item.kind === "attachment")
          return (
            item.filename.toLowerCase().includes(q) ||
            item.user.fullName.toLowerCase().includes(q)
          );
        return true;
      });
    }
    return actSort === "asc" ? [...items].reverse() : items;
  }, [allItems, actSearch, actSort]);

  const grouped = useMemo(() => {
    if (actGroup === "none") return [{ label: "", items: displayItems }];

    if (actGroup === "day") {
      const groups: { label: string; items: FeedItem[] }[] = [];
      for (const item of displayItems) {
        const key = dayKey(new Date(item.createdAt).getTime());
        const last = groups.at(-1);
        if (last && last.label === key) last.items.push(item);
        else groups.push({ label: key, items: [item] });
      }
      return groups;
    }

    const map = new Map<string, FeedItem[]>();
    for (const item of displayItems) {
      const key =
        actGroup === "type"
          ? item.kind === "comment"
            ? "Comments"
            : item.kind === "activity"
              ? "Activity"
              : "Attachments"
          : item.user.fullName;
      const existing = map.get(key);
      if (existing) existing.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries()).map(([label, items]) => ({
      label,
      items,
    }));
  }, [displayItems, actGroup]);

  const commentCount = allItems.filter((i) => i.kind === "comment").length;
  const changesCount = allItems.filter((i) => i.kind !== "comment").length;

  return (
    <div
      className="flex flex-col rounded-lg border overflow-hidden"
      style={{
        height: "min(680px, calc(100vh - 280px))",
        borderColor: PANEL_BORDER,
        background:
          "color-mix(in srgb, var(--brand-green) 5%, var(--background))",
      }}
    >
      {canComment && (
        <CommentComposer
          issueId={issueId}
          canInternal={canInternal}
          borderColor={PANEL_BORDER}
        />
      )}

      {/* Pinned header */}
      <div
        className="shrink-0 px-4 pt-3 pb-2.5 border-b space-y-2"
        style={{ borderColor: PANEL_BORDER }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Activity</span>
            {displayItems.length > 0 && (
              <span className="inline-flex items-center justify-center h-4.5 min-w-4.5 px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold tabular-nums">
                {displayItems.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs border transition-colors",
                actSort !== "desc"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowUpDown className="size-3" />
              {actSort === "desc" ? "Newest" : "Oldest"}
            </button>
            <div className="hidden sm:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-1 text-xs border transition-colors",
                      actGroup !== "day"
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Layers className="size-3" />
                    {GROUP_LABELS[actGroup]}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuLabel className="text-xs py-1.5">
                    Group by
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(["day", "type", "user", "none"] as ActGroup[]).map((g) => (
                    <DropdownMenuItem
                      key={g}
                      onClick={() => setGroup(g)}
                      className="justify-between text-xs"
                    >
                      {GROUP_LABELS[g]}
                      {actGroup === g && (
                        <span className="text-primary">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search activity…"
            value={actSearch}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-input bg-background/80 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {actSearch && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {(
            [
              ["all", "All", commentCount + changesCount],
              ["comments", "Comments", commentCount],
              ["changes", "Changes", changesCount],
            ] as const
          ).map(([f, label, count]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground border-border",
              )}
            >
              {label}
              <span
                className={cn(
                  "tabular-nums rounded-full px-1.5 text-[10px]",
                  filter === f ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="size-6 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-3 bg-muted animate-pulse rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {actSearch
              ? "No activity matches your search."
              : "Nothing here yet."}
          </p>
        ) : (
          <div>
            {grouped.map(({ label, items }) => (
              <div key={label}>
                {label && (
                  <div className="flex items-center gap-2 py-3">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap px-1">
                      {label}
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}
                <div className="space-y-3">
                  {items.map((item) => {
                    const isSelf = item.user.id === currentUserId;
                    if (item.kind === "comment")
                      return (
                        <CommentBubble
                          key={item.id}
                          comment={item as unknown as Comment}
                          isSelf={isSelf}
                        />
                      );
                    if (item.kind === "activity")
                      return (
                        <ActivityRow
                          key={item.id}
                          activity={item as unknown as Activity}
                          isSelf={isSelf}
                        />
                      );
                    return (
                      <AttachmentRow
                        key={item.id}
                        item={item}
                        isSelf={isSelf}
                        issueId={issueId}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
            <div ref={sentinelRef} className="h-1" />
          </div>
        )}
      </div>
    </div>
  );
}
