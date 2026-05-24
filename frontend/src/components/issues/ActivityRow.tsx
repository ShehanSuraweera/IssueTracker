import { History, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, relTime } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import type { Activity, IssueStatus, PriorityLevel } from "@/types/issues";

function renderFieldValue(val: string | null, fieldName: string) {
  if (!val)
    return (
      <span className="text-muted-foreground/50 italic text-xs">none</span>
    );
  if (fieldName === "status")
    return <StatusBadge status={val as IssueStatus} />;
  if (fieldName === "priority")
    return <PriorityBadge priority={val as PriorityLevel} />;
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-foreground/80 max-w-36 truncate">
      {val}
    </span>
  );
}

export function ActivityRow({
  activity,
  isSelf,
}: {
  activity: Activity;
  isSelf: boolean;
}) {
  const field = activity.fieldName.replace(/_/g, " ");
  const ts = new Date(activity.createdAt).getTime();
  const isSet = !activity.oldValue && !!activity.newValue;

  return (
    <div className={cn("flex gap-2 items-start", isSelf && "justify-end")}>
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 mt-0.5",
          isSelf && "order-last",
        )}
      >
        <History className="size-3 text-muted-foreground" />
      </div>
      <div className={cn("min-w-0 py-0.5 max-w-[78%]", isSelf && "text-right")}>
        <div
          className={cn(
            "flex items-center gap-1.5 flex-wrap text-sm leading-snug",
            isSelf && "justify-end",
          )}
        >
          <span className="font-medium">{activity.user.fullName}</span>
          <span className="text-muted-foreground">
            {isSet ? "set" : "changed"}
          </span>
          <span className="font-medium capitalize text-foreground/80">
            {field}
          </span>
          {!isSet && activity.oldValue !== null && (
            <>
              {renderFieldValue(activity.oldValue, activity.fieldName)}
              <ArrowRight className="size-3 text-muted-foreground shrink-0" />
            </>
          )}
          {renderFieldValue(activity.newValue, activity.fieldName)}
        </div>
        <p
          className="text-[10px] text-muted-foreground/60 mt-0.5"
          title={fmtDateTime(activity.createdAt)}
        >
          {relTime(ts)}
        </p>
      </div>
    </div>
  );
}
