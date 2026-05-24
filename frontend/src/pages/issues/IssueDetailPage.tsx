import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBack } from "@/hooks/use-back";
import type { ReactNode } from "react";
import {
  ArrowLeft, Loader2, Send, User, Clock, Paperclip,
  Calendar, Building2, Package, CheckCircle2,
  History, Lock, Tag, AlertCircle,
  ChevronDown, ChevronRight, Pencil, ArrowRight,
  Search, UserPlus, X, ArrowUpDown, Layers,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useIssue, useAddComment, useResolveIssue, useUpdateIssue, useFeed, useAssignIssue } from "@/hooks/use-issues";
import { useEngineers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useIssuePermissions } from "@/hooks/use-issue-permissions";
import type { User as AuthUser } from "@/types/users";
import { useTabsStore } from "@/store/tabs.store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { OFFICE_LABEL } from "@/lib/theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IssueDetail, Comment, Activity, IssueStatus, PriorityLevel, FeedItem, FeedFilter } from "@/types/issues";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";

const TYPE_LABELS: Record<string, string> = {
  bug:             "Bug",
  feature_request: "Feature Request",
  question:        "Question",
  incident:        "Incident",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)         return "just now";
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return fmtDate(new Date(ts).toISOString());
}
function dayKey(ts: number): string {
  const d = new Date(ts);
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}


// ─── SLA Gauge ────────────────────────────────────────────────────────────────

function SlaGauge({ slaDeadline, createdAt }: { slaDeadline: string; createdAt: string }) {
  const now = Date.now();
  const start = new Date(createdAt).getTime();
  const end   = new Date(slaDeadline).getTime();
  const total = end - start;
  const remaining = end - now;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const isExpired = remaining <= 0;

  const arcColor = isExpired || pct <= 0.2
    ? "var(--destructive)"
    : pct <= 0.5
    ? "var(--warning)"
    : "var(--brand-green)";

  const r = 36;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;

  const abs = Math.abs(remaining);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" style={{ stroke: "var(--border)" }} strokeWidth="7" />
        <circle
          cx="45" cy="45" r={r} fill="none"
          style={{ stroke: arcColor }}
          strokeWidth="7"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
        />
      </svg>
      <div className="text-center">
        <p className="text-sm font-semibold tabular-nums">
          {isExpired ? "Expired" : `${d}d ${h}h ${m}m`}
        </p>
        <p className="text-xs text-muted-foreground">Remaining</p>
      </div>
    </div>
  );
}

// ─── Meta row ─────────────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="text-sm font-medium mt-0.5 truncate">{value}</div>
      </div>
    </div>
  );
}

// ─── Left panel — metadata ────────────────────────────────────────────────────

function MetaPanel({ issue }: { issue: IssueDetail }) {
  return (
    <div>
      {/* Status / priority / type badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <StatusBadge status={issue.status} />
        <PriorityBadge priority={issue.priority} />
        <Badge variant="outline" className="text-xs">{TYPE_LABELS[issue.type] ?? issue.type}</Badge>
      </div>

      <Separator className="mb-3" />

      <div className="space-y-0.5">
        <MetaRow
          icon={<Package className="size-3.5" />}
          label="Product"
          value={
            <span>
              {issue.product.name}{" "}
              <span className="font-mono text-muted-foreground text-xs">({issue.product.code})</span>
            </span>
          }
        />
        <MetaRow
          icon={<User className="size-3.5" />}
          label="Opened by"
          value={issue.creator.fullName}
        />
        <MetaRow
          icon={<Building2 className="size-3.5" />}
          label="Assigned to"
          value={
            issue.assignee?.fullName ?? (
              <span className="text-muted-foreground font-normal">Unassigned</span>
            )
          }
        />
        <MetaRow
          icon={<Tag className="size-3.5" />}
          label="Impact"
          value={<span className="capitalize">{issue.impact}</span>}
        />
        <MetaRow
          icon={<AlertCircle className="size-3.5" />}
          label="Urgency"
          value={<span className="capitalize">{issue.urgency}</span>}
        />
        <MetaRow
          icon={<Calendar className="size-3.5" />}
          label="Opened"
          value={fmtDate(issue.createdAt)}
        />
        {issue.slaDeadline && (
          <MetaRow
            icon={<Clock className="size-3.5" />}
            label="SLA Deadline"
            value={fmtDateTime(issue.slaDeadline)}
          />
        )}
        {issue.resolvedAt && (
          <MetaRow
            icon={<CheckCircle2 className="size-3.5" />}
            label="Resolved"
            value={fmtDate(issue.resolvedAt)}
          />
        )}
      </div>

      <Separator className="my-4" />

      {/* Description */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</p>
        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{issue.description}</p>
      </div>

      {/* Attachments */}
      {issue.attachments.length > 0 && (
        <>
          <Separator className="my-4" />
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Paperclip className="size-3.5" />
            <span>
              {issue.attachments.length} attachment{issue.attachments.length !== 1 ? "s" : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Comment bubble ───────────────────────────────────────────────────────────

function CommentBubble({ comment, isSelf }: { comment: Comment; isSelf: boolean }) {
  return (
    <div className={cn("flex items-end gap-2", isSelf && "flex-row-reverse")}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
        {comment.user.fullName.charAt(0).toUpperCase()}
      </div>
      <div className={cn("flex flex-col min-w-0 max-w-[78%]", isSelf && "items-end")}>
        <div className={cn("flex items-center gap-1.5 mb-1 flex-wrap", isSelf && "flex-row-reverse")}>
          {!isSelf && (
            <>
              <span className="text-xs font-semibold">{comment.user.fullName}</span>
              <span className="text-[10px] text-muted-foreground capitalize">
                {comment.user.role.replace("_", " ")}
              </span>
            </>
          )}
          {comment.isInternal && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              <Lock className="size-2.5" /> Internal
            </span>
          )}
          <span className="text-[10px] text-muted-foreground" title={fmtDateTime(comment.createdAt)}>
            {relTime(new Date(comment.createdAt).getTime())}
          </span>
        </div>
        <div
          className={cn(
            "px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed border",
            isSelf ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm",
            comment.isInternal
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : isSelf
              ? "border-transparent"
              : "bg-background border-border",
          )}
          style={isSelf && !comment.isInternal ? {
            background: "color-mix(in srgb, var(--brand-green) 22%, var(--background))",
            borderColor: "color-mix(in srgb, var(--brand-green) 35%, transparent)",
          } : undefined}
        >
          {comment.body}
        </div>
      </div>
    </div>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function renderFieldValue(val: string | null, fieldName: string) {
  if (!val) return <span className="text-muted-foreground/50 italic text-xs">none</span>;
  if (fieldName === "status")   return <StatusBadge   status={val as IssueStatus}     />;
  if (fieldName === "priority") return <PriorityBadge priority={val as PriorityLevel} />;
  return <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-foreground/80 max-w-36 truncate">{val}</span>;
}

function ActivityRow({ activity, isSelf }: { activity: Activity; isSelf: boolean }) {
  const field = activity.fieldName.replace(/_/g, " ");
  const ts    = new Date(activity.createdAt).getTime();
  const isSet = !activity.oldValue && !!activity.newValue;

  return (
    <div className={cn("flex gap-2 items-start", isSelf && "justify-end")}>
      <div className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 mt-0.5",
        isSelf && "order-last",
      )}>
        <History className="size-3 text-muted-foreground" />
      </div>
      <div className={cn("min-w-0 py-0.5 max-w-[78%]", isSelf && "text-right")}>
        <div className={cn("flex items-center gap-1.5 flex-wrap text-sm leading-snug", isSelf && "justify-end")}>
          <span className="font-medium">{activity.user.fullName}</span>
          <span className="text-muted-foreground">{isSet ? "set" : "changed"}</span>
          <span className="font-medium capitalize text-foreground/80">{field}</span>
          {!isSet && activity.oldValue !== null && (
            <>
              {renderFieldValue(activity.oldValue, activity.fieldName)}
              <ArrowRight className="size-3 text-muted-foreground shrink-0" />
            </>
          )}
          {renderFieldValue(activity.newValue, activity.fieldName)}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5" title={fmtDateTime(activity.createdAt)}>
          {relTime(ts)}
        </p>
      </div>
    </div>
  );
}

// ─── Attachment row ───────────────────────────────────────────────────────────

type FeedAttachment = Extract<FeedItem, { kind: "attachment" }>;

function AttachmentRow({ item, isSelf }: { item: FeedAttachment; isSelf: boolean }) {
  const ts     = new Date(item.createdAt).getTime();
  const sizeKb = Math.round(Number(item.sizeBytes) / 1024);
  return (
    <div className={cn("flex gap-2 items-start", isSelf && "justify-end")}>
      <div className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 mt-0.5",
        isSelf && "order-last",
      )}>
        <Paperclip className="size-3 text-muted-foreground" />
      </div>
      <div className={cn("min-w-0 py-0.5 max-w-[78%]", isSelf && "text-right")}>
        <div className={cn("flex items-center gap-1.5 flex-wrap text-sm leading-snug", isSelf && "justify-end")}>
          <span className="font-medium">{item.user.fullName}</span>
          <span className="text-muted-foreground">attached</span>
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-muted border font-medium max-w-48 truncate">
            <Paperclip className="size-2.5 shrink-0" />
            {item.filename}
          </span>
          <span className="text-[10px] text-muted-foreground">{sizeKb > 0 ? `${sizeKb} KB` : "< 1 KB"}</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5" title={fmtDateTime(item.createdAt)}>
          {relTime(ts)}
        </p>
      </div>
    </div>
  );
}

// ─── Center panel — unified activity feed ────────────────────────────────────

type ActGroup = "day" | "type" | "user" | "none";
type ActSort  = "desc" | "asc";

const GROUP_LABELS: Record<ActGroup, string> = {
  day:  "By day",
  type: "By type",
  user: "By user",
  none: "None",
};

function ActivityPanel({
  issueId,
  canComment,
  canInternal,
  currentUserId,
}: {
  issueId: string;
  canComment: boolean;
  canInternal: boolean;
  currentUserId?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);

  const [filter,      setFilter] = useState<FeedFilter>("all");
  const [commentBody, setBody]   = useState("");
  const [isInternal,  setIntern] = useState(false);
  const [actSearch,   setSearch] = useState("");
  const [actSort,     setSort]   = useState<ActSort>("desc");
  const [actGroup,    setGroup]  = useState<ActGroup>("day");

  const commentMutation = useAddComment(issueId);
  const { data: feedData, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useFeed(issueId, filter);

  useEffect(() => {
    const el   = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchNextPage(); },
      { threshold: 0.1, root },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const allItems = useMemo<FeedItem[]>(
    () => feedData?.pages.flatMap(p => p.data) ?? [],
    [feedData],
  );

  const displayItems = useMemo<FeedItem[]>(() => {
    let items = allItems;
    if (actSearch.trim()) {
      const q = actSearch.toLowerCase();
      items = items.filter(item => {
        if (item.kind === "comment")    return item.body.toLowerCase().includes(q) || item.user.fullName.toLowerCase().includes(q);
        if (item.kind === "activity")   return item.fieldName.toLowerCase().includes(q) || (item.newValue ?? "").toLowerCase().includes(q) || (item.oldValue ?? "").toLowerCase().includes(q) || item.user.fullName.toLowerCase().includes(q);
        if (item.kind === "attachment") return item.filename.toLowerCase().includes(q) || item.user.fullName.toLowerCase().includes(q);
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
        const key  = dayKey(new Date(item.createdAt).getTime());
        const last = groups.at(-1);
        if (last && last.label === key) last.items.push(item);
        else groups.push({ label: key, items: [item] });
      }
      return groups;
    }

    const map = new Map<string, FeedItem[]>();
    for (const item of displayItems) {
      const key = actGroup === "type"
        ? item.kind === "comment" ? "Comments" : item.kind === "activity" ? "Activity" : "Attachments"
        : item.user.fullName;
      const existing = map.get(key);
      if (existing) existing.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [displayItems, actGroup]);

  const commentCount = allItems.filter(i => i.kind === "comment").length;
  const changesCount = allItems.filter(i => i.kind !== "comment").length;

  const submit = () => {
    if (!commentBody.trim()) return;
    commentMutation.mutate(
      { body: commentBody, isInternal },
      { onSuccess: () => { setBody(""); setIntern(false); } },
    );
  };

  const borderColor = "color-mix(in srgb, var(--brand-green) 30%, transparent)";

  return (
    <div
      className="flex flex-col rounded-lg border overflow-hidden"
      style={{
        height: "min(680px, calc(100vh - 280px))",
        borderColor,
        background: "color-mix(in srgb, var(--brand-green) 5%, var(--background))",
      }}
    >
      {/* Pinned composer */}
      {canComment && (
        <div
          className="shrink-0 px-4 py-3 border-b bg-background/60 backdrop-blur-sm"
          style={{ borderColor }}
        >
          <p className="text-xs text-muted-foreground mb-2">
            {isInternal
              ? "Internal note — only visible to engineers and admins"
              : "Everyone can see this comment"}
          </p>
          <textarea
            className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none resize-none min-h-16"
            placeholder="Write a comment…"
            value={commentBody}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div className="flex items-center justify-between pt-2 border-t mt-1">
            {canInternal ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={isInternal} onChange={e => setIntern(e.target.checked)} className="rounded" />
                <Lock className="size-3" /> Internal note
              </label>
            ) : <span />}
            <Button size="sm" disabled={!commentBody.trim() || commentMutation.isPending} onClick={submit}>
              {commentMutation.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Send className="size-4 mr-1.5" />}
              Post
            </Button>
          </div>
        </div>
      )}

      {/* Pinned activity header */}
      <div
        className="shrink-0 px-4 pt-3 pb-2.5 border-b space-y-2"
        style={{ borderColor }}
      >
        {/* Row 1 — title + sort + group */}
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
            {/* Sort toggle */}
            <button
              onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs border transition-colors",
                actSort !== "desc"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              title={actSort === "desc" ? "Newest first" : "Oldest first"}
            >
              <ArrowUpDown className="size-3" />
              {actSort === "desc" ? "Newest" : "Oldest"}
            </button>

            {/* Group dropdown — desktop only */}
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
                  <DropdownMenuLabel className="text-xs py-1.5">Group by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(["day", "type", "user", "none"] as ActGroup[]).map(g => (
                    <DropdownMenuItem
                      key={g}
                      onClick={() => setGroup(g)}
                      className="justify-between text-xs"
                    >
                      {GROUP_LABELS[g]}
                      {actGroup === g && <span className="text-primary">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Row 2 — search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search activity…"
            value={actSearch}
            onChange={e => setSearch(e.target.value)}
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

        {/* Row 3 — filter chips */}
        <div className="flex items-center gap-1.5">
          {([
            ["all",      "All",      commentCount + changesCount],
            ["comments", "Comments", commentCount],
            ["changes",  "Changes",  changesCount],
          ] as const).map(([f, label, count]) => (
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
              <span className={cn(
                "tabular-nums rounded-full px-1.5 text-[10px]",
                filter === f ? "bg-primary-foreground/20" : "bg-muted",
              )}>
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
            {actSearch ? "No activity matches your search." : "Nothing here yet."}
          </p>
        ) : (
          <div>
            {grouped.map(({ label, items }) => (
              <div key={label}>
                {label && (
                  <div className="flex items-center gap-2 py-3">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap px-1">{label}</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}
                <div className="space-y-3">
                  {items.map(item => {
                    const isSelf = item.user.id === currentUserId;
                    if (item.kind === "comment")  return <CommentBubble key={item.id} comment={item as unknown as Comment}  isSelf={isSelf} />;
                    if (item.kind === "activity") return <ActivityRow   key={item.id} activity={item as unknown as Activity} isSelf={isSelf} />;
                    return                               <AttachmentRow key={item.id} item={item}                            isSelf={isSelf} />;
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


// ─── Assignment card ──────────────────────────────────────────────────────────

function AssignmentCard({
  issue, isAdmin, isEngineer, user,
}: {
  issue: IssueDetail;
  isAdmin: boolean;
  isEngineer: boolean;
  user: AuthUser | null;
}) {
  const [search, setSearch] = useState("");
  const [pendingAssignId, setPendingAssignId] = useState<string | null>(null);
  const { data: engineers = [] } = useEngineers();
  const assignMutation = useAssignIssue(issue.id);

  const isClosed  = issue.status === "closed" || issue.status === "cancelled";
  const assignee  = issue.assignee;
  const isSelf    = !!user && !!assignee && assignee.id === user.id;

  const filtered = engineers.filter(e =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  const pendingEngineer = pendingAssignId ? engineers.find(e => e.id === pendingAssignId) : null;

  const confirmAssign = () => {
    if (!pendingAssignId) return;
    assignMutation.mutate(pendingAssignId, { onSettled: () => setPendingAssignId(null) });
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Assignment</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Current assignee */}
        {assignee ? (
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
              {assignee.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{assignee.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{assignee.email}</p>
            </div>
            {isSelf && (
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 shrink-0">You</Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
              <User className="size-3.5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unassigned</p>
              <p className="text-xs text-muted-foreground/70">No engineer assigned</p>
            </div>
          </div>
        )}

        {!isClosed && (isAdmin || isEngineer) && (
          <>
            <Separator />

            {/* Admin: searchable engineer picker */}
            {isAdmin && (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search engineers..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-0.5 rounded-md">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No engineers found</p>
                  ) : filtered.map(eng => {
                    const isAssigned = eng.id === assignee?.id;
                    const isPending  = pendingAssignId === eng.id;
                    const isLoading  = assignMutation.isPending && assignMutation.variables === eng.id;
                    return (
                      <Tooltip key={eng.id}>
                        <TooltipTrigger asChild>
                          <button
                            disabled={assignMutation.isPending || isAssigned}
                            onClick={() => !isAssigned && setPendingAssignId(eng.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                              isAssigned  ? "bg-primary/5 cursor-default" :
                              isPending   ? "bg-amber-50 border border-amber-200" :
                                            "hover:bg-muted cursor-pointer",
                              "disabled:opacity-60"
                            )}
                          >
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-[10px]">
                              {eng.fullName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium flex-1 truncate">{eng.fullName}</span>
                            {eng.office && (
                              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                                {eng.office}
                              </span>
                            )}
                            {isLoading  && <Loader2    className="size-3.5 animate-spin text-muted-foreground shrink-0" />}
                            {isAssigned && !isLoading && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="p-3 space-y-2 max-w-52">
                          <div className="flex items-center gap-2">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                              {eng.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-tight truncate">{eng.fullName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{eng.email}</p>
                            </div>
                          </div>
                          <div className="space-y-1 pt-1 border-t border-border/50">
                            {eng.office && (
                              <p className="text-[10px] text-muted-foreground">
                                <span className="font-semibold uppercase tracking-wide">Office</span>{" "}
                                {OFFICE_LABEL[eng.office] ?? eng.office}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                              <span className="font-semibold uppercase tracking-wide">Joined</span>{" "}
                              {fmtDate(eng.createdAt)}
                            </p>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border",
                              eng.isActive
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-600 border-red-200"
                            )}>
                              {eng.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                {pendingAssignId && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Assign to <span className="font-medium text-foreground">{pendingEngineer?.fullName}</span>?
                    </p>
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setPendingAssignId(null)}>Cancel</Button>
                      <Button size="sm" disabled={assignMutation.isPending} onClick={confirmAssign}>
                        {assignMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Assign"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Engineer: claim button or "assigned to you" badge */}
            {isEngineer && !isSelf && (
              pendingAssignId === user?.id ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-muted-foreground">Assign this issue to yourself?</p>
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setPendingAssignId(null)}>Cancel</Button>
                    <Button size="sm" disabled={assignMutation.isPending} onClick={confirmAssign}>
                      {assignMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Assign to Me"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={assignMutation.isPending}
                  onClick={() => user && setPendingAssignId(user.id)}
                >
                  <UserPlus className="size-3.5 mr-1.5" />
                  Assign to Me
                </Button>
              )
            )}
            {isEngineer && isSelf && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="size-3.5" />
                Assigned to you
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Right panel — record info ────────────────────────────────────────────────

function RecordPanel({ issue }: { issue: IssueDetail }) {
  return (
    <div className="space-y-4">
      {/* Record information — redundant on mobile (shown in title bar badges) */}
      <Card className="hidden lg:block">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Record Information</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Number</p>
              <p className="font-mono text-xs mt-0.5">{issue.ticketNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</p>
              <PriorityBadge priority={issue.priority} className="mt-0.5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">State</p>
              <StatusBadge status={issue.status} className="mt-0.5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
              <p className="text-xs mt-0.5">{TYPE_LABELS[issue.type] ?? issue.type}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact — redundant on mobile (shown in Details tab MetaPanel) */}
      <Card className="hidden lg:block">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Contact</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
              {issue.creator.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{issue.creator.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{issue.creator.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SLA gauge */}
      {issue.slaDeadline && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">SLA Status</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex justify-center">
            <SlaGauge slaDeadline={issue.slaDeadline} createdAt={issue.createdAt} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Issue Timeline ───────────────────────────────────────────────────────────

type TLKind = "comment" | "internal" | "status" | "field";

interface TLEvent {
  id:     string;
  time:   number;
  kind:   TLKind;
  actor:  string;
  label:  string;
  detail: string;
}

const KIND_COLOR: Record<TLKind, string> = {
  comment:  "bg-blue-500",
  internal: "bg-amber-500",
  status:   "bg-violet-500",
  field:    "bg-slate-400",
};

const KIND_LABEL: Record<TLKind, string> = {
  comment:  "Comment",
  internal: "Internal note",
  status:   "Status change",
  field:    "Field change",
};

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function tlTickLabel(ts: number): string {
  const d = new Date(ts);
  if (d.getDate() <= 2) return `${MON_NAMES[d.getMonth()]} ${d.getDate()}`;
  return `${d.getDate()} ${DAY_NAMES[d.getDay()]}`;
}

function IssueTimeline({ issue }: { issue: IssueDetail }) {
  const [open,        setOpen]    = useState(true);
  const [showDetails, setDetails] = useState(false);

  const start = new Date(issue.createdAt).getTime();
  const end   = issue.resolvedAt ? new Date(issue.resolvedAt).getTime()
              : issue.closedAt   ? new Date(issue.closedAt).getTime()
              : Date.now();
  const isLive = !issue.resolvedAt && !issue.closedAt;

  const PAD        = 2 * 86_400_000;
  const axisStart  = start - PAD;
  const axisEnd    = end   + PAD;
  const axisSpan   = Math.max(axisEnd - axisStart, 1);

  const trackLeftPct  = ((start - axisStart) / axisSpan) * 100;
  const trackRightPct = ((end   - axisStart) / axisSpan) * 100;

  const events: TLEvent[] = [
    ...issue.comments.map(c => ({
      id:     c.id,
      time:   new Date(c.createdAt).getTime(),
      kind:   (c.isInternal ? "internal" : "comment") as TLKind,
      actor:  c.user.fullName,
      label:  c.isInternal ? "Internal note" : "Comment",
      detail: c.body.length > 60 ? c.body.slice(0, 60) + "…" : c.body,
    })),
    ...issue.activities.map(a => ({
      id:     a.id,
      time:   new Date(a.createdAt).getTime(),
      kind:   (a.fieldName === "status" ? "status" : "field") as TLKind,
      actor:  a.user.fullName,
      label:  a.fieldName === "status"
                ? `Status → ${a.newValue}`
                : `${a.fieldName.replace(/_/g, " ")} changed`,
      detail: a.oldValue && a.newValue ? `"${a.oldValue}" → "${a.newValue}"` : (a.newValue ?? ""),
    })),
  ].sort((a, b) => a.time - b.time);

  const clusters: TLEvent[][] = [];
  for (const ev of events) {
    const evPct   = ((ev.time - axisStart) / axisSpan) * 100;
    const last    = clusters.at(-1);
    const lastPct = last ? ((last[0].time - axisStart) / axisSpan) * 100 : -999;
    if (last && evPct - lastPct < 2.5) last.push(ev);
    else clusters.push([ev]);
  }

  const TICKS = 9;
  const ticks = Array.from({ length: TICKS }, (_, i) => ({
    pct:   (i / (TICKS - 1)) * 100,
    label: tlTickLabel(axisStart + (axisSpan / (TICKS - 1)) * i),
  }));

  const presentKinds = (["comment", "internal", "status", "field"] as TLKind[])
    .filter(k => events.some(e => e.kind === k));

  return (
    <div className="border rounded-lg">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors rounded-t-lg"
      >
        <span className="text-sm font-medium">Timeline</span>
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-blue-400 inline-block" />
            {issue.comments.length} comments
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-violet-400 inline-block" />
            {issue.activities.length} events
          </span>
          {isLive && (
            <span className="px-1.5 py-0.5 rounded border border-border bg-background font-medium text-[10px]">
              Now
            </span>
          )}
          {open ? <ChevronDown className="size-3.5 ml-1" /> : <ChevronRight className="size-3.5 ml-1" />}
        </div>
      </button>

      {open && (
        <div className="px-6 pt-4 pb-3">

          {/* Pins row — sits directly above the track */}
          <div className="relative h-8">
            {clusters.map((cluster, i) => {
              const pct      = ((cluster[0].time - axisStart) / axisSpan) * 100;
              const primary  = cluster[0].kind;
              const flipLeft  = pct > 75;
              const flipRight = pct < 25;

              return (
                <div
                  key={i}
                  className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center group z-20 cursor-default"
                  style={{ left: `${pct}%` }}
                >
                  {/* Box */}
                  <div className="flex items-center justify-center rounded-sm border border-border bg-background shadow-sm h-4.5 min-w-4.5 px-1 text-[9px] font-semibold text-muted-foreground">
                    {cluster.length > 1
                      ? cluster.length
                      : <span className={cn("size-1.5 rounded-full shrink-0", KIND_COLOR[primary])} />
                    }
                  </div>
                  {/* Stem */}
                  <div className="w-px h-1.5 bg-border" />

                  {/* Tooltip */}
                  <div className={cn(
                    "absolute bottom-full mb-1 hidden group-hover:block z-30",
                    "w-52 rounded-lg border border-border bg-popover shadow-xl p-2.5",
                    flipLeft  ? "right-0" :
                    flipRight ? "left-0"  : "left-1/2 -translate-x-1/2",
                  )}>
                    <div className="space-y-2">
                      {cluster.map(ev => (
                        <div key={ev.id} className="text-xs border-b border-border/50 last:border-0 pb-2 last:pb-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={cn("size-1.5 rounded-full shrink-0", KIND_COLOR[ev.kind])} />
                            <span className="font-medium">{ev.label}</span>
                          </div>
                          <p className="text-muted-foreground pl-3">{ev.actor}</p>
                          {ev.detail && (
                            <p className="text-muted-foreground/80 pl-3 truncate">{ev.detail}</p>
                          )}
                          <p className="text-muted-foreground/60 pl-3 mt-0.5">
                            {fmtDateTime(new Date(ev.time).toISOString())}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Track */}
          <div className="relative h-2.5 rounded-full bg-muted">
            {/* Brand-green segment: actual issue start → end */}
            <div
              className="absolute top-0 bottom-0 rounded-full"
              style={{
                left:            `${trackLeftPct}%`,
                right:           `${100 - trackRightPct}%`,
                backgroundColor: "var(--brand-green)",
              }}
            >
              {/* Start cap */}
              <div
                title="Created"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 size-3.5 rounded-full border-2 border-background shadow z-10"
                style={{ backgroundColor: "var(--brand-green)" }}
              />
              {/* End cap */}
              <div
                title={issue.resolvedAt ? "Resolved" : issue.closedAt ? "Closed" : "Now"}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 size-3.5 rounded-full border-2 border-background shadow z-10 bg-muted-foreground/50"
              >
                {isLive && (
                  <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-foreground whitespace-nowrap">
                    Now
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Date axis */}
          <div className="relative h-5 mt-1.5 select-none">
            {ticks.map((tick, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
                style={{
                  left: `${tick.pct}%`,
                  transform:
                    i === 0           ? "none"
                    : i === TICKS - 1 ? "translateX(-100%)"
                    : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {/* Show Details toggle */}
          {presentKinds.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setDetails(d => !d)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails
                  ? <ChevronDown  className="size-3" />
                  : <ChevronRight className="size-3" />}
                Show Details
              </button>
              {showDetails && (
                <div className="flex items-center gap-4 mt-2 pt-2 border-t">
                  {presentKinds.map(k => (
                    <span key={k} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className={cn("size-2 rounded-full", KIND_COLOR[k])} />
                      {KIND_LABEL[k]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Edit panel config ────────────────────────────────────────────────────────

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-6 w-96" />
      <Skeleton className="h-4 w-64" />
      <Separator />
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 items-start pt-1">
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
        <div className="space-y-3 hidden lg:block">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IssueDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const { hasRole, user } = useAuth();
  const back = useBack("/issues");

  const { data: issue, isLoading } = useIssue(id);
  const resolveMutation    = useResolveIssue(id);
  const updateMutation     = useUpdateIssue(id);
  const assignSelfMutation = useAssignIssue(id);
  const { updateLabel, updateMeta } = useTabsStore();
  const [activeTab, setActiveTab] = useState<"details" | "activity" | "info">("details");

  useEffect(() => {
    if (!issue || !id) return;
    updateLabel(`issue:${id}`, issue.ticketNumber);
    updateMeta(`issue:${id}`, {
      title:    issue.title,
      status:   issue.status,
      priority: issue.priority,
    });
  }, [issue?.ticketNumber, issue?.status, issue?.priority, id]);

  if (isLoading) return <DetailSkeleton />;
  if (!issue)    return null;

  const {
    isStaff,
    canEdit, canResolve, canAssignSelf, canClose, canComment, isLocked,
  } = useIssuePermissions(issue, user ?? null, hasRole);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
          <ArrowLeft className="mr-1.5 size-4" />
          Back
        </Button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit button */}
          {issue.status !== "closed" && issue.status !== "cancelled" && (
            isLocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" size="sm" disabled>
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="p-3 max-w-64">
                  <p className="font-mono text-[10px] text-muted-foreground mb-1">Edit locked</p>
                  <p className="text-sm font-medium leading-snug mb-2">
                    An engineer has picked this up
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Contact support to request changes.
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : canEdit ? (
              <Button variant="outline" size="sm" onClick={() => navigate(`/issues/${id}/edit`, { state: { back: `/issues/${id}` } })}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            ) : null
          )}

          {/* Assign to Me — engineer shortcut */}
          {canAssignSelf && (
            <InlineConfirm
              trigger={
                <Button variant="outline" size="sm">
                  <UserPlus className="mr-1.5 size-3.5" />
                  Assign to Me
                </Button>
              }
              message="Assign this issue to yourself?"
              confirmLabel="Assign to Me"
              isPending={assignSelfMutation.isPending}
              onConfirm={() => user && assignSelfMutation.mutate(user.id)}
            />
          )}

          {/* Resolve with confirmation */}
          {canResolve && (
            <InlineConfirm
              trigger={
                <Button size="sm">
                  <CheckCircle2 className="mr-1.5 size-4" />
                  Mark Resolved
                </Button>
              }
              message="Mark as resolved?"
              confirmLabel="Yes, resolve"
              cancelLabel="No"
              isPending={resolveMutation.isPending}
              onConfirm={() => resolveMutation.mutate()}
            />
          )}

          {/* Close Issue — admin or client after resolution */}
          {canClose && (
            <InlineConfirm
              trigger={
                <Button variant="outline" size="sm">
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  Close Issue
                </Button>
              }
              message="Close this issue?"
              confirmLabel="Close Issue"
              isPending={updateMutation.isPending}
              onConfirm={() => updateMutation.mutate({ status: "closed" })}
            />
          )}
        </div>
      </div>

      {/* Title area */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {issue.ticketNumber}
          </span>
          <StatusBadge status={issue.status} />
          <PriorityBadge priority={issue.priority} />
        </div>
        <h1 className="text-xl font-semibold leading-snug">{issue.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {issue.product.name} · opened by {issue.creator.fullName} · {fmtDate(issue.createdAt)}
        </p>
      </div>

      <Separator />

      <>
        {/* Mobile tab bar */}
        <div className="lg:hidden flex border-b">
          {(["details", "activity", "info"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {tab === "details" ? "Details" : tab === "activity" ? "Activity" : "Info"}
            </button>
          ))}
        </div>

        {/* Timeline — desktop only (too dense for mobile) */}
        <div className="hidden lg:block">
          <IssueTimeline issue={issue} />
        </div>

        {/* 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 items-start">
          <div className={cn(activeTab !== "details" && "hidden lg:block")}>
            <MetaPanel issue={issue} />
          </div>
          <div className={cn(activeTab !== "activity" && "hidden lg:block")}>
            <ActivityPanel issueId={issue.id} canComment={canComment} canInternal={isStaff} currentUserId={user?.id} />
          </div>
          <div className={cn("space-y-4", activeTab !== "info" && "hidden lg:block")}>
            <AssignmentCard
              issue={issue}
              isAdmin={hasRole("admin")}
              isEngineer={hasRole("engineer")}
              user={user ?? null}
            />
            <RecordPanel issue={issue} />
          </div>
        </div>
      </>
    </div>
  );
}
