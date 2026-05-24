import type { ReactNode } from "react";
import { Package, User, Building2, Tag, AlertCircle, Calendar, Clock, CheckCircle2, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { IssueDetail } from "@/types/issues";

const TYPE_LABELS: Record<string, string> = {
  bug:             "Bug",
  feature_request: "Feature Request",
  question:        "Question",
  incident:        "Incident",
};

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

export function MetaPanel({ issue }: { issue: IssueDetail }) {
  return (
    <div>
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

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</p>
        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{issue.description}</p>
      </div>

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
