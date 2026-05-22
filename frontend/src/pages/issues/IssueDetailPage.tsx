import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  ArrowLeft, Loader2, Send, User, Clock, Paperclip,
  Calendar, Building2, Package, CheckCircle2,
  History, Lock, Tag, AlertCircle,
  ChevronDown, ChevronRight, Pencil, ArrowRight,
  Bug, Lightbulb, HelpCircle, AlertTriangle,
  Search, UserPlus,
} from "lucide-react";
import { useIssue, useAddComment, useResolveIssue, useUpdateIssue, useFeed, useAssignIssue } from "@/hooks/use-issues";
import { useEngineers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import type { User as AuthUser } from "@/types/users";
import { useTabsStore } from "@/store/tabs.store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IssueDetail, Comment, Activity, UpdateIssueInput, IssueStatus, IssueType, ImpactLevel, UrgencyLevel, FeedItem, FeedFilter } from "@/types/issues";

// ─── Config maps ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  new:         { label: "New",         cls: "bg-purple-100 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  on_hold:     { label: "On Hold",     cls: "bg-amber-100 text-amber-700 border-amber-200" },
  resolved:    { label: "Resolved",    cls: "bg-green-100 text-green-700 border-green-200" },
  closed:      { label: "Closed",      cls: "bg-gray-100 text-gray-600 border-gray-200" },
  cancelled:   { label: "Cancelled",   cls: "bg-red-100 text-red-600 border-red-200" },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-red-100 text-red-700 border-red-200" },
  high:     { label: "High",     cls: "bg-orange-100 text-orange-700 border-orange-200" },
  moderate: { label: "Moderate", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low:      { label: "Low",      cls: "bg-sky-100 text-sky-700 border-sky-200" },
};

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
    ? "#ef4444"
    : pct <= 0.5
    ? "#f59e0b"
    : "#22c55e";

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
        <circle cx="45" cy="45" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx="45" cy="45" r={r} fill="none"
          stroke={arcColor}
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
  const status   = STATUS_CONFIG[issue.status]   ?? { label: issue.status,   cls: "" };
  const priority = PRIORITY_CONFIG[issue.priority] ?? { label: issue.priority, cls: "" };

  return (
    <div>
      {/* Status / priority / type badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Badge variant="outline" className={`text-xs ${status.cls}`}>{status.label}</Badge>
        <Badge variant="outline" className={`text-xs ${priority.cls}`}>{priority.label}</Badge>
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

function CommentBubble({ comment }: { comment: Comment }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
        {comment.user.fullName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-sm font-medium">{comment.user.fullName}</span>
          <span className="text-xs text-muted-foreground capitalize">
            {comment.user.role.replace("_", " ")}
          </span>
          {comment.isInternal && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              <Lock className="size-2.5" /> Internal
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto" title={fmtDateTime(comment.createdAt)}>{relTime(new Date(comment.createdAt).getTime())}</span>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
            comment.isInternal
              ? "bg-amber-50 border border-amber-200 text-amber-900"
              : "bg-muted/40 border border-border"
          }`}
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
  if (fieldName === "status") {
    const cfg = STATUS_CONFIG[val] ?? { label: val, cls: "" };
    return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border", cfg.cls)}>{cfg.label}</span>;
  }
  if (fieldName === "priority") {
    const cfg = PRIORITY_CONFIG[val] ?? { label: val, cls: "" };
    return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border", cfg.cls)}>{cfg.label}</span>;
  }
  return <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-foreground/80 max-w-36 truncate">{val}</span>;
}

function ActivityRow({ activity }: { activity: Activity }) {
  const field = activity.fieldName.replace(/_/g, " ");
  const ts    = new Date(activity.createdAt).getTime();
  const isSet = !activity.oldValue && !!activity.newValue;

  return (
    <div className="flex gap-3 items-start">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 mt-0.5">
        <History className="size-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-center gap-1.5 flex-wrap text-sm leading-snug">
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

function AttachmentRow({ item }: { item: FeedAttachment }) {
  const ts     = new Date(item.createdAt).getTime();
  const sizeKb = Math.round(Number(item.sizeBytes) / 1024);
  return (
    <div className="flex gap-3 items-start">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 mt-0.5">
        <Paperclip className="size-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-center gap-1.5 flex-wrap text-sm leading-snug">
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

function ActivityPanel({
  issueId,
  canComment,
  canInternal,
}: {
  issueId: string;
  canComment: boolean;
  canInternal: boolean;
}) {
  const sentinelRef                                    = useRef<HTMLDivElement>(null);
  const [filter,      setFilter]                       = useState<FeedFilter>("all");
  const [commentBody, setBody]                         = useState("");
  const [isInternal,  setIntern]                       = useState(false);
  const commentMutation                                = useAddComment(issueId);
  const { data: feedData, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useFeed(issueId, filter);

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

  const allItems = useMemo<FeedItem[]>(
    () => feedData?.pages.flatMap(p => p.data) ?? [],
    [feedData],
  );

  const grouped = useMemo(() => {
    const groups: { day: string; items: FeedItem[] }[] = [];
    for (const item of allItems) {
      const day  = dayKey(new Date(item.createdAt).getTime());
      const last = groups.at(-1);
      if (last && last.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    }
    return groups;
  }, [allItems]);

  const commentCount = allItems.filter(i => i.kind === "comment").length;
  const changesCount = allItems.filter(i => i.kind !== "comment").length;

  const submit = () => {
    if (!commentBody.trim()) return;
    commentMutation.mutate(
      { body: commentBody, isInternal },
      { onSuccess: () => { setBody(""); setIntern(false); } },
    );
  };

  return (
    <div className="flex flex-col gap-0">

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 mb-4">
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

      {/* Comment composer — top of feed */}
      {canComment && (filter === "all" || filter === "comments") && (
        <div className="border rounded-lg p-3 mb-5 bg-card">
          <p className="text-xs text-muted-foreground mb-2">
            {isInternal
              ? "Internal note — only visible to engineers and admins"
              : "Everyone can see this comment"}
          </p>
          <textarea
            className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none resize-none min-h-18"
            placeholder="Write a comment…"
            value={commentBody}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div className="flex items-center justify-between pt-2 border-t mt-2">
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

      {/* Feed */}
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
      ) : allItems.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nothing here yet.</p>
      ) : (
        <div>
          {grouped.map(({ day, items }) => (
            <div key={day}>
              <div className="flex items-center gap-2 py-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap px-1">{day}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-4">
                {items.map(item => {
                  if (item.kind === "comment")    return <CommentBubble key={item.id} comment={item as unknown as Comment} />;
                  if (item.kind === "activity")   return <ActivityRow   key={item.id} activity={item as unknown as Activity} />;
                  return                                 <AttachmentRow key={item.id} item={item} />;
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
  );
}

const OFFICE_LABEL: Record<string, string> = {
  KR: "Korea",
  LK: "Sri Lanka",
  IN: "India",
};

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
  const status   = STATUS_CONFIG[issue.status]    ?? { label: issue.status,   cls: "" };
  const priority = PRIORITY_CONFIG[issue.priority] ?? { label: issue.priority, cls: "" };

  return (
    <div className="space-y-4">
      {/* Record information */}
      <Card>
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
              <Badge variant="outline" className={`text-[10px] mt-0.5 ${priority.cls}`}>{priority.label}</Badge>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">State</p>
              <Badge variant="outline" className={`text-[10px] mt-0.5 ${status.cls}`}>{status.label}</Badge>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
              <p className="text-xs mt-0.5">{TYPE_LABELS[issue.type] ?? issue.type}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
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

function IssueTimeline({ issue }: { issue: IssueDetail }) {
  const totalEvents = issue.activities.length + issue.comments.length;
  const [open, setOpen] = useState(totalEvents > 3);

  const start = new Date(issue.createdAt).getTime();
  const end   = issue.resolvedAt ? new Date(issue.resolvedAt).getTime()
              : issue.closedAt   ? new Date(issue.closedAt).getTime()
              : Date.now();
  const span  = Math.max(end - start, 1);

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

  // Cluster events whose positions are within 2.5% of each other
  const clusters: TLEvent[][] = [];
  for (const ev of events) {
    const evPct   = ((ev.time - start) / span) * 100;
    const last    = clusters.at(-1);
    const lastPct = last ? ((last[0].time - start) / span) * 100 : -999;
    if (last && evPct - lastPct < 2.5) last.push(ev);
    else clusters.push([ev]);
  }

  // 4 evenly-spaced axis ticks
  const TICKS = 4;
  const ticks = Array.from({ length: TICKS }, (_, i) => ({
    pct:   (i / (TICKS - 1)) * 100,
    label: i === TICKS - 1 && !issue.resolvedAt && !issue.closedAt
      ? "Now"
      : fmtDate(new Date(start + (span / (TICKS - 1)) * i).toISOString()),
  }));

  const presentKinds = (["comment", "internal", "status", "field"] as TLKind[])
    .filter(k => events.some(e => e.kind === k));

  return (
    <div className="border rounded-lg">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors rounded-t-lg"
      >
        <span className="text-sm font-medium">Timeline</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-blue-400 inline-block" />
            {issue.comments.length} comments
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-violet-400 inline-block" />
            {issue.activities.length} events
          </span>
          {open
            ? <ChevronDown  className="size-3.5" />
            : <ChevronRight className="size-3.5" />}
        </div>
      </button>

      {open && (
        <div className="px-6 pt-6 pb-4">
          {/* Track + dots */}
          <div className="relative h-8">
            {/* Track */}
            <div className="absolute top-3.5 left-0 right-0 h-1 bg-muted rounded-full" />

            {/* Start pin */}
            <div
              title="Created"
              className="absolute top-2.5 left-0 -translate-x-1/2 size-3 rounded-full bg-green-500 border-2 border-background shadow-sm z-10"
            />

            {/* End pin */}
            <div
              title={issue.resolvedAt ? "Resolved" : issue.closedAt ? "Closed" : "Now"}
              className="absolute top-2.5 right-0 translate-x-1/2 size-3 rounded-full bg-muted-foreground/50 border-2 border-background shadow-sm z-10"
            />

            {/* Clusters */}
            {clusters.map((cluster, i) => {
              const clusterPct = ((cluster[0].time - start) / span) * 100;
              const primary    = cluster[0].kind;
              const flipLeft   = clusterPct > 75;
              const flipRight  = clusterPct < 25;

              return (
                <div
                  key={i}
                  className="absolute top-1.5 -translate-x-1/2 group z-20 cursor-default"
                  style={{ left: `${clusterPct}%` }}
                >
                  {/* Dot */}
                  <div className={cn(
                    "size-5 rounded-full border-2 border-background shadow-sm",
                    "flex items-center justify-center",
                    KIND_COLOR[primary],
                  )}>
                    {cluster.length > 1 && (
                      <span className="text-white text-[8px] font-bold leading-none">
                        {cluster.length}
                      </span>
                    )}
                  </div>

                  {/* Hover tooltip */}
                  <div className={cn(
                    "absolute top-full mt-2 hidden group-hover:block z-30",
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

          {/* Date axis */}
          <div className="relative h-5 mt-1 select-none">
            {ticks.map((tick, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
                style={{
                  left: `${tick.pct}%`,
                  transform:
                    i === 0            ? "none"
                    : i === TICKS - 1  ? "translateX(-100%)"
                    : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {/* Legend — only show kinds that actually appear */}
          {presentKinds.length > 0 && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
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
  );
}

// ─── Edit panel config ────────────────────────────────────────────────────────

const EDIT_TYPE_OPTIONS: Array<{
  value: IssueType; label: string; Icon: React.ElementType; desc: string; iconCls: string;
}> = [
  { value: "bug",             label: "Bug",      Icon: Bug,           desc: "Something isn't working", iconCls: "text-red-500"    },
  { value: "feature_request", label: "Feature",  Icon: Lightbulb,     desc: "Suggest an improvement",  iconCls: "text-yellow-500" },
  { value: "question",        label: "Question", Icon: HelpCircle,    desc: "Need clarification",      iconCls: "text-blue-500"   },
  { value: "incident",        label: "Incident", Icon: AlertTriangle, desc: "Service disruption",      iconCls: "text-orange-500" },
];

const EDIT_LEVEL_OPTIONS: Array<{ value: ImpactLevel | UrgencyLevel; label: string }> = [
  { value: "low",    label: "Low"    },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High"   },
];

const EDIT_LEVEL_COLORS: Record<string, { active: string; idle: string }> = {
  low:    { active: "bg-slate-500 text-white", idle: "text-slate-500 hover:bg-slate-100/70" },
  medium: { active: "bg-amber-400 text-white", idle: "text-amber-600 hover:bg-amber-50"    },
  high:   { active: "bg-red-500   text-white", idle: "text-red-500   hover:bg-red-50"      },
};

// Valid next statuses per current status (mirrors backend transition machine)
const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  new:         ["in_progress", "cancelled"],
  in_progress: ["on_hold", "resolved", "cancelled"],
  on_hold:     ["in_progress", "cancelled"],
  resolved:    ["closed", "in_progress"],
  closed:      [],
  cancelled:   [],
};

// ─── Edit panel ───────────────────────────────────────────────────────────────

function EditPanel({
  issue, onSave, onCancel, isPending, isStaff,
}: {
  issue: IssueDetail;
  onSave: (input: UpdateIssueInput) => void;
  onCancel: () => void;
  isPending: boolean;
  isStaff: boolean;
}) {
  const [title,       setTitle]   = useState(issue.title);
  const [description, setDesc]    = useState(issue.description);
  const [type,        setType]    = useState<IssueType>(issue.type);
  const [impact,      setImpact]  = useState<ImpactLevel>(issue.impact as ImpactLevel);
  const [urgency,     setUrgency] = useState<UrgencyLevel>(issue.urgency as UrgencyLevel);
  const [status,      setStatus]  = useState<IssueStatus>(issue.status);

  const isDirty =
    title !== issue.title ||
    description !== issue.description ||
    type   !== issue.type   ||
    impact !== issue.impact ||
    urgency !== issue.urgency ||
    (isStaff && status !== issue.status);

  const handleSave = () => {
    if (!title.trim() || !description.trim()) return;
    const input: UpdateIssueInput = {};
    if (title       !== issue.title)       input.title       = title;
    if (description !== issue.description) input.description = description;
    if (type        !== issue.type)        input.type        = type;
    if (impact      !== issue.impact)      input.impact      = impact;
    if (urgency     !== issue.urgency)     input.urgency     = urgency;
    if (isStaff && status !== issue.status) input.status     = status;
    onSave(input);
  };

  const validNextStatuses = STATUS_TRANSITIONS[issue.status];

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Edit Issue</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" disabled={!isDirty || isPending} onClick={handleSave}>
            {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          rows={5}
          value={description}
          onChange={e => setDesc(e.target.value)}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      {/* Type cards */}
      <div className="space-y-1.5">
        <Label>Type</Label>
        <div className="grid grid-cols-4 gap-2">
          {EDIT_TYPE_OPTIONS.map(({ value, label, Icon, desc, iconCls }) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                type === value
                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <Icon className={cn("size-4", iconCls)} />
              <span className="text-xs font-medium">{label}</span>
              <span className="text-[10px] leading-tight opacity-70">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Impact + Urgency */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Impact</Label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {EDIT_LEVEL_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setImpact(value as ImpactLevel)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition-colors",
                  impact === value ? EDIT_LEVEL_COLORS[value].active : EDIT_LEVEL_COLORS[value].idle,
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Urgency</Label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {EDIT_LEVEL_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setUrgency(value as UrgencyLevel)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition-colors",
                  urgency === value ? EDIT_LEVEL_COLORS[value].active : EDIT_LEVEL_COLORS[value].idle,
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status — staff only, only valid transitions */}
      {isStaff && validNextStatuses.length > 0 && (
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as IssueStatus)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={issue.status}>{STATUS_CONFIG[issue.status]?.label ?? issue.status}</option>
            {validNextStatuses.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-6 w-96" />
      <Skeleton className="h-4 w-64" />
      <Separator />
      <div className="grid grid-cols-[260px_1fr_260px] gap-6 items-start pt-1">
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
        <div className="space-y-3">
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

  const { data: issue, isLoading } = useIssue(id);
  const resolveMutation    = useResolveIssue(id);
  const updateMutation     = useUpdateIssue(id);
  const assignSelfMutation = useAssignIssue(id);
  const { updateLabel, updateMeta } = useTabsStore();

  const [isEditing,             setIsEditing]             = useState(false);
  const [showResolveConfirm,    setShowResolveConfirm]    = useState(false);
  const [showAssignSelfConfirm, setShowAssignSelfConfirm] = useState(false);
  const [showCloseConfirm,      setShowCloseConfirm]      = useState(false);

  useEffect(() => {
    if (!issue || !id) return;
    updateLabel(`issue:${id}`, issue.ticketNumber);
    updateMeta(`issue:${id}`, {
      title:    issue.title,
      status:   issue.status,
      priority: issue.priority,
    });
  }, [issue?.ticketNumber, issue?.status, issue?.priority, id]);

  // Exit edit mode whenever the issue reloads after a save
  useEffect(() => { setIsEditing(false); }, [issue?.updatedAt]);

  if (isLoading) return <DetailSkeleton />;
  if (!issue)    return null;

  const isStaff      = hasRole("admin", "engineer");
  const isEngineer   = hasRole("engineer");
  const isClosed     = issue.status === "closed" || issue.status === "cancelled";
  const isSelf       = !!user && !!issue.assignee && issue.assignee.id === user.id;
  const canEdit      = isStaff || issue.status === "new";
  const canResolve   = isStaff && (issue.status === "in_progress" || issue.status === "on_hold");
  const canAssignSelf = isEngineer && !isSelf && !isClosed;
  const canClose      = (hasRole("admin") || hasRole("client_user")) && issue.status === "resolved";
  const canComment   = issue.status !== "closed" && issue.status !== "cancelled";
  const isLocked     = !isStaff && issue.status !== "new";

  const status   = STATUS_CONFIG[issue.status]     ?? { label: issue.status,   cls: "" };
  const priority = PRIORITY_CONFIG[issue.priority] ?? { label: issue.priority, cls: "" };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="mr-1.5 size-4" />
          Back
        </Button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit button — always visible unless terminal status or already editing */}
          {!isEditing && issue.status !== "closed" && issue.status !== "cancelled" && (
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
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            ) : null
          )}

          {/* Assign to Me — engineer shortcut */}
          {canAssignSelf && !isEditing && (
            showAssignSelfConfirm ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
                <span className="text-sm text-muted-foreground">Assign this issue to yourself?</span>
                <Button variant="outline" size="sm" onClick={() => setShowAssignSelfConfirm(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={assignSelfMutation.isPending}
                  onClick={() => {
                    user && assignSelfMutation.mutate(user.id, { onSettled: () => setShowAssignSelfConfirm(false) });
                  }}
                >
                  {assignSelfMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Assign to Me"}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowAssignSelfConfirm(true)}>
                <UserPlus className="mr-1.5 size-3.5" />
                Assign to Me
              </Button>
            )
          )}

          {/* Resolve with inline confirmation */}
          {canResolve && !isEditing && (
            showResolveConfirm ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
                <span className="text-sm text-muted-foreground">Mark as resolved?</span>
                <Button variant="outline" size="sm" onClick={() => setShowResolveConfirm(false)}>
                  No
                </Button>
                <Button
                  size="sm"
                  disabled={resolveMutation.isPending}
                  onClick={() => { resolveMutation.mutate(); setShowResolveConfirm(false); }}
                >
                  {resolveMutation.isPending
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : "Yes, resolve"}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setShowResolveConfirm(true)}>
                <CheckCircle2 className="mr-1.5 size-4" />
                Mark Resolved
              </Button>
            )
          )}

          {/* Close Issue — admin or client after resolution */}
          {canClose && !isEditing && (
            showCloseConfirm ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
                <span className="text-sm text-muted-foreground">Close this issue?</span>
                <Button variant="outline" size="sm" onClick={() => setShowCloseConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={() => {
                    updateMutation.mutate({ status: "closed" }, { onSettled: () => setShowCloseConfirm(false) });
                  }}
                >
                  {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Close Issue"}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowCloseConfirm(true)}>
                <CheckCircle2 className="mr-1.5 size-3.5" />
                Close Issue
              </Button>
            )
          )}
        </div>
      </div>

      {/* Title area */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {issue.ticketNumber}
          </span>
          <Badge variant="outline" className={`text-xs ${status.cls}`}>{status.label}</Badge>
          <Badge variant="outline" className={`text-xs ${priority.cls}`}>{priority.label}</Badge>
        </div>
        <h1 className="text-xl font-semibold leading-snug">{issue.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {issue.product.name} · opened by {issue.creator.fullName} · {fmtDate(issue.createdAt)}
        </p>
      </div>

      <Separator />

      {isEditing ? (
        <EditPanel
          issue={issue}
          isPending={updateMutation.isPending}
          isStaff={isStaff}
          onCancel={() => setIsEditing(false)}
          onSave={input => updateMutation.mutate(input)}
        />
      ) : (
        <>
          {/* Timeline */}
          <IssueTimeline issue={issue} />

          {/* 3-column layout */}
          <div className="grid grid-cols-[260px_1fr_260px] gap-6 items-start">
            <MetaPanel issue={issue} />
            <ActivityPanel issueId={issue.id} canComment={canComment} canInternal={isStaff} />
            <div className="space-y-4">
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
      )}
    </div>
  );
}
