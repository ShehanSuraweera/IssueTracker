import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import type { IssueDetail } from "@/types/issues";

const TYPE_LABELS: Record<string, string> = {
  bug:             "Bug",
  feature_request: "Feature Request",
  question:        "Question",
  incident:        "Incident",
};

function SlaGauge({ slaDeadline, createdAt }: { slaDeadline: string; createdAt: string }) {
  const now       = Date.now();
  const start     = new Date(createdAt).getTime();
  const end       = new Date(slaDeadline).getTime();
  const total     = end - start;
  const remaining = end - now;
  const pct       = Math.max(0, Math.min(1, remaining / total));
  const isExpired = remaining <= 0;

  const arcColor = isExpired || pct <= 0.2
    ? "var(--destructive)"
    : pct <= 0.5
    ? "var(--warning)"
    : "var(--brand-green)";

  const r            = 36;
  const circumference = 2 * Math.PI * r;
  const dash          = pct * circumference;

  const abs = Math.abs(remaining);
  const d   = Math.floor(abs / 86_400_000);
  const h   = Math.floor((abs % 86_400_000) / 3_600_000);
  const m   = Math.floor((abs % 3_600_000) / 60_000);

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

export function RecordPanel({ issue }: { issue: IssueDetail }) {
  return (
    <div className="space-y-4">
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
