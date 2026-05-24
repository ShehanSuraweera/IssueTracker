import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBack } from "@/hooks/use-back";
import {
  ArrowLeft, CheckCircle2, UserPlus, Pencil, Trash2,
} from "lucide-react";
import { useIssue, useResolveIssue, useUpdateIssue, useAssignIssue, useDeleteIssue } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { useIssuePermissions } from "@/hooks/use-issue-permissions";
import { useTabsStore } from "@/store/tabs.store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { MetaPanel } from "@/components/issues/MetaPanel";
import { ActivityPanel } from "@/components/issues/ActivityPanel";
import { AssignmentCard } from "@/components/issues/AssignmentCard";
import { RecordPanel } from "@/components/issues/RecordPanel";
import { IssueTimeline } from "@/components/issues/IssueTimeline";

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

export default function IssueDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { hasRole, user } = useAuth();
  const back = useBack("/issues");

  const { data: issue, isLoading } = useIssue(id);
  const resolveMutation    = useResolveIssue(id);
  const updateMutation     = useUpdateIssue(id);
  const assignSelfMutation = useAssignIssue(id);
  const deleteMutation     = useDeleteIssue();
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
                  <p className="text-sm font-medium leading-snug mb-2">An engineer has picked this up</p>
                  <p className="text-xs text-muted-foreground">Contact support to request changes.</p>
                </TooltipContent>
              </Tooltip>
            ) : canEdit ? (
              <Button variant="outline" size="sm" onClick={() => navigate(`/issues/${id}/edit`, { state: { back: `/issues/${id}` } })}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            ) : null
          )}

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

          {hasRole("admin") && (
            <InlineConfirm
              trigger={
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              }
              message="Permanently delete this issue? This cannot be undone."
              confirmLabel="Delete"
              isPending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate(id!, { onSuccess: () => navigate("/issues") })}
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

      {/* Timeline — desktop only */}
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
    </div>
  );
}
