import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  ArrowLeft, Loader2, Send, User, Clock, Paperclip,
  Calendar, Building2, Package, CheckCircle2,
  MessageSquare, History, Lock, Tag, AlertCircle,
} from "lucide-react";
import { useIssue, useAddComment, useResolveIssue } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IssueDetail, Comment, Activity } from "@/types/issues";

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
          <span className="text-xs text-muted-foreground ml-auto">{fmtDateTime(comment.createdAt)}</span>
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

function ActivityRow({ activity }: { activity: Activity }) {
  const field = activity.fieldName.replace(/_/g, " ");
  let message: string;
  if (!activity.oldValue)  message = `set ${field} to "${activity.newValue}"`;
  else if (!activity.newValue) message = `cleared ${field}`;
  else message = `changed ${field} from "${activity.oldValue}" to "${activity.newValue}"`;

  return (
    <div className="flex gap-3 items-start">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
        <History className="size-3.5 text-muted-foreground" />
      </div>
      <p className="flex-1 text-sm text-muted-foreground py-0.5">
        <span className="font-medium text-foreground">{activity.user.fullName}</span>
        {" "}{message}
        <span className="ml-2 text-xs">{fmtDateTime(activity.createdAt)}</span>
      </p>
    </div>
  );
}

// ─── Center panel — activity feed ─────────────────────────────────────────────

function ActivityPanel({
  issue,
  canComment,
  canInternal,
}: {
  issue: IssueDetail;
  canComment: boolean;
  canInternal: boolean;
}) {
  const [tab, setTab]           = useState<"comments" | "activity">("comments");
  const [commentBody, setBody]  = useState("");
  const [isInternal, setIntern] = useState(false);
  const commentMutation = useAddComment(issue.id);

  const visibleComments = canInternal
    ? issue.comments
    : issue.comments.filter((c) => !c.isInternal);

  const submit = () => {
    if (!commentBody.trim()) return;
    commentMutation.mutate(
      { body: commentBody, isInternal },
      { onSuccess: () => { setBody(""); setIntern(false); } },
    );
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Tab bar */}
      <div className="flex border-b mb-4">
        {(["comments", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {t === "comments" ? (
              <><MessageSquare className="size-3.5" />Comments ({visibleComments.length})</>
            ) : (
              <><History className="size-3.5" />Activity ({issue.activities.length})</>
            )}
          </button>
        ))}
      </div>

      {/* Comment composer — shown at top of comments tab */}
      {canComment && tab === "comments" && (
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
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div className="flex items-center justify-between pt-2 border-t mt-2">
            {canInternal ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIntern(e.target.checked)}
                  className="rounded"
                />
                <Lock className="size-3" /> Internal note
              </label>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              disabled={!commentBody.trim() || commentMutation.isPending}
              onClick={submit}
            >
              {commentMutation.isPending
                ? <Loader2 className="size-4 animate-spin mr-1.5" />
                : <Send className="size-4 mr-1.5" />}
              Post Comment
            </Button>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-5">
        {tab === "comments" && (
          visibleComments.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">No comments yet.</p>
            : visibleComments.map((c) => <CommentBubble key={c.id} comment={c} />)
        )}
        {tab === "activity" && (
          issue.activities.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">No activity yet.</p>
            : issue.activities.map((a) => <ActivityRow key={a.id} activity={a} />)
        )}
      </div>
    </div>
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
          {issue.assignee && (
            <div className="flex items-center gap-2.5 mt-3 pt-3 border-t">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-sm">
                {issue.assignee.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{issue.assignee.fullName}</p>
                <p className="text-xs text-muted-foreground">Assigned engineer</p>
              </div>
            </div>
          )}
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
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const { hasRole }  = useAuth();

  const { data: issue, isLoading } = useIssue(id);
  const resolveMutation = useResolveIssue(id);

  if (isLoading) return <DetailSkeleton />;
  if (!issue)    return null;

  const isStaff  = hasRole("admin", "engineer");
  const canResolve = isStaff && (issue.status === "in_progress" || issue.status === "on_hold");
  const canComment = issue.status !== "closed" && issue.status !== "cancelled";

  const status   = STATUS_CONFIG[issue.status]    ?? { label: issue.status,   cls: "" };
  const priority = PRIORITY_CONFIG[issue.priority] ?? { label: issue.priority, cls: "" };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="mr-1.5 size-4" />
          Back
        </Button>
        {canResolve && (
          <Button
            size="sm"
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
          >
            {resolveMutation.isPending
              ? <Loader2 className="mr-1.5 size-4 animate-spin" />
              : <CheckCircle2 className="mr-1.5 size-4" />}
            Mark Resolved
          </Button>
        )}
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

      {/* 3-column layout */}
      <div className="grid grid-cols-[260px_1fr_260px] gap-6 items-start">
        <MetaPanel issue={issue} />
        <ActivityPanel issue={issue} canComment={canComment} canInternal={isStaff} />
        <RecordPanel issue={issue} />
      </div>
    </div>
  );
}
