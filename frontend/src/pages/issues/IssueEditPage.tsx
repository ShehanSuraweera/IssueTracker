import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, useBlocker } from "react-router-dom";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useIssue, useUpdateIssue } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { IssueForm } from "@/components/issue/IssueForm";
import { IssueContextPanel } from "@/components/issue/IssueContextPanel";
import type {
  IssueStatus, IssueType, ImpactLevel, UrgencyLevel, UpdateIssueInput,
} from "@/types/issues";

const TIPS = [
  "Update the title if the scope of the issue has changed",
  "Be specific about what changed since the issue was first reported",
  "Update impact/urgency if the business context has shifted",
  "Use the status field to move the issue forward in the workflow",
];

const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  new:         ["in_progress", "cancelled"],
  in_progress: ["on_hold", "resolved", "cancelled"],
  on_hold:     ["in_progress", "cancelled"],
  resolved:    ["closed", "in_progress"],
  closed:      [],
  cancelled:   [],
};

function EditSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6 lg:gap-8 items-start">
      <div className="space-y-5">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-6 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

export default function IssueEditPage() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { hasRole } = useAuth();

  const { data: issue, isLoading } = useIssue(id);
  const updateMutation             = useUpdateIssue(id);

  const backTo  = (location.state as { back?: string } | null)?.back ?? `/issues/${id}`;
  const isStaff = hasRole("admin", "engineer");

  const [liveValues, setLiveValues] = useState<{ impact: ImpactLevel; urgency: UrgencyLevel }>({
    impact: "medium",
    urgency: "medium",
  });

  const [formIsDirty, setFormIsDirty] = useState(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      formIsDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!formIsDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formIsDirty]);

  if (isLoading) return <EditSkeleton />;
  if (!issue)    return null;

  const validNextStatuses = STATUS_TRANSITIONS[issue.status];

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6 lg:gap-8 items-start">

        {/* ── Left: form ─────────────────────────────────────── */}
        <div>
          <div className="mb-5">
            <h1 className="text-xl font-semibold">Edit Issue</h1>
            <p className="font-mono text-sm text-muted-foreground mt-0.5">{issue.ticketNumber}</p>
          </div>

          <IssueForm
            mode="edit"
            defaultValues={{
              title:       issue.title,
              description: issue.description,
              type:        issue.type,
              impact:      issue.impact  as ImpactLevel,
              urgency:     issue.urgency as UrgencyLevel,
              status:      issue.status,
            }}
            showStatusSelect={isStaff && validNextStatuses.length > 0}
            currentStatus={issue.status}
            statusOptions={validNextStatuses}
            onValuesChange={setLiveValues}
            onDirtyChange={setFormIsDirty}
            onSubmit={(values) => {
              const input: UpdateIssueInput = {};
              if (values.title       !== issue.title)       input.title       = values.title;
              if (values.description !== issue.description) input.description = values.description;
              if (values.type        !== issue.type)        input.type        = values.type   as IssueType;
              if (values.impact      !== issue.impact)      input.impact      = values.impact as ImpactLevel;
              if (values.urgency     !== issue.urgency)     input.urgency     = values.urgency as UrgencyLevel;
              if (isStaff && values.status && values.status !== issue.status)
                                                            input.status      = values.status as IssueStatus;
              updateMutation.mutate(input, {
                onSuccess: () => { setFormIsDirty(false); navigate(backTo); },
              });
            }}
            onCancel={() => navigate(backTo)}
            isPending={updateMutation.isPending}
            isError={updateMutation.isError}
          />
        </div>

        {/* ── Right: context panel ────────────────────────────── */}
        <IssueContextPanel
          impact={liveValues.impact}
          urgency={liveValues.urgency}
          tips={TIPS}
          tipsTitle="Editing tips"
        />

      </div>

      {/* Unsaved-changes guard */}
      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={() => blocker.reset?.()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <TriangleAlert className="size-4 text-amber-500 shrink-0" />
              <DialogTitle>Unsaved changes</DialogTitle>
            </div>
            <DialogDescription>
              You have unsaved changes. If you leave now they will be permanently lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => blocker.reset?.()}>
              Stay and keep editing
            </Button>
            <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700" onClick={() => blocker.proceed?.()}>
              Leave anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
