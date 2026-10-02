import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEscalations } from "@/hooks/use-ai";
import { relTime } from "@/lib/format";
import { AiTag, FrustrationMeter } from "./ai-bits";

/** Open issues whose latest client message reads as high escalation risk. */
export function HighRiskIssuesCard() {
  const { data, isLoading, isError } = useEscalations(true);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-0.5 flex items-center gap-1.5">
        <p className="text-sm font-semibold">High escalation risk</p>
        <AiTag />
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 shrink-0 cursor-default text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 px-3 py-2 text-xs leading-relaxed">
            Open issues where the client's most recent message suggests they may escalate or leave.
            A signal for account managers: it never changes an issue's priority.
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Based on the latest client message on each issue</p>

      {isLoading && <Skeleton className="h-24 w-full" />}
      {isError && <p className="text-sm text-muted-foreground">Unavailable right now.</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">No open issues at high risk of escalation.</p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y">
          {data.map((issue) => (
            <li key={issue.issueId} className="py-2.5 first:pt-0 last:pb-0">
              <Link to={`/issues/${issue.issueId}`} className="group block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{issue.ticketNumber}</span>
                    <span className="truncate text-sm font-medium group-hover:underline">{issue.title}</span>
                  </div>
                  <PriorityBadge priority={issue.priority} className="shrink-0 px-1.5 py-0 text-[10px]" />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {issue.companyName} · “{issue.evidenceQuote}”
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <FrustrationMeter level={issue.frustrationLevel} />
                    {relTime(new Date(issue.assessedAt).getTime())}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
