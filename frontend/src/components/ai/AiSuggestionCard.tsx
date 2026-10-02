import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { useAiSuggestion, useRetryAnalysis, useReviewSuggestion } from "@/hooks/use-ai";
import { CATEGORY_LABEL, LEVEL_LABEL, TEAM_LABEL } from "@/lib/ai-display";
import { derivePriority } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { AiSuggestion, TriageValues } from "@/types/ai";
import type { IssueDetail } from "@/types/issues";
import { AiCardMessage, AiTag, Pill } from "./ai-bits";

const FIELDS = [
  { key: "impact", label: "Impact", options: LEVEL_LABEL },
  { key: "urgency", label: "Urgency", options: LEVEL_LABEL },
  { key: "category", label: "Category", options: CATEGORY_LABEL },
  { key: "team", label: "Team", options: TEAM_LABEL },
] as const;

const STATUS_LABEL = {
  accepted: { text: "Accepted", cls: "bg-green-100 text-green-700 border-green-200" },
  edited: { text: "Applied with edits", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  rejected: { text: "Rejected", cls: "bg-slate-100 text-slate-600 border-slate-200" },
} as const;

export function AiSuggestionCard({ issue }: { issue: IssueDetail }) {
  const { data, isLoading, isError } = useAiSuggestion(issue.id, true);
  const retry = useRetryAnalysis(issue.id);

  // Staff-created issues aren't analysed; nothing to show
  if (data && data.analysis.status === "none" && !data.suggestion) return null;

  const status = data?.analysis.status;
  const suggestion = data?.suggestion;

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          Triage suggestion <AiTag />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {isLoading && <Skeleton className="h-28 w-full" />}
        {isError && <AiCardMessage>AI triage is unavailable right now.</AiCardMessage>}

        {!suggestion && (status === "queued" || status === "running") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Analysing this issue…
          </div>
        )}

        {!suggestion && status === "failed" && (
          <div className="space-y-2">
            <AiCardMessage>
              The analysis didn't complete
              {data?.analysis.lastErrorCode ? ` (${data.analysis.lastErrorCode})` : ""}. The
              issue itself is unaffected.
            </AiCardMessage>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={retry.isPending}
              onClick={() => retry.mutate()}
            >
              <RotateCcw className="mr-1.5 size-3" />
              Retry analysis
            </Button>
          </div>
        )}

        {suggestion && suggestion.status === "pending" && (
          // Keyed so the form resets when a newer suggestion replaces this one
          <SuggestionForm key={suggestion.id} issue={issue} suggestion={suggestion} />
        )}

        {suggestion && suggestion.status !== "pending" && <ReviewedSuggestion suggestion={suggestion} />}
      </CardContent>
    </Card>
  );
}

function SuggestionForm({ issue, suggestion }: { issue: IssueDetail; suggestion: AiSuggestion }) {
  const review = useReviewSuggestion(issue.id);
  const suggested: TriageValues = {
    impact: suggestion.suggested.impact.value,
    urgency: suggestion.suggested.urgency.value,
    category: suggestion.suggested.category.value,
    team: suggestion.suggested.team.value,
  };
  const [values, setValues] = useState<TriageValues>(suggested);

  const edited = FIELDS.some(({ key }) => values[key] !== suggested[key]);
  const newPriority = derivePriority(values.impact, values.urgency);

  return (
    <div className="space-y-3">
      {suggestion.manipulationAttempt && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          This issue contains text that tries to instruct the AI. Check the suggestion carefully.
        </div>
      )}

      {FIELDS.map(({ key, label, options }) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`ai-${key}`}
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </label>
            {values[key] !== suggested[key] && (
              <span className="text-[10px] font-medium text-blue-600">changed</span>
            )}
          </div>
          <select
            id={`ai-${key}`}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Object.entries(options).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {suggestion.suggested[key].reason}
          </p>
        </div>
      ))}

      <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px]">
        <span className="text-muted-foreground">Priority</span>
        <PriorityBadge priority={issue.priority} className="px-1.5 py-0 text-[10px]" />
        <ArrowRight className="size-3 text-muted-foreground" />
        <PriorityBadge priority={newPriority} className="px-1.5 py-0 text-[10px]" />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={review.isPending}
          onClick={() =>
            review.mutate({ suggestionId: suggestion.id, input: { action: "apply", ...values } })
          }
        >
          <Check className="mr-1 size-3.5" />
          {edited ? "Apply with changes" : "Apply"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={review.isPending}
          onClick={() => review.mutate({ suggestionId: suggestion.id, input: { action: "reject" } })}
        >
          <X className="mr-1 size-3.5" />
          Reject
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Nothing changes until you apply. {suggestion.model} · {suggestion.promptVersion}
      </p>
    </div>
  );
}

function ReviewedSuggestion({ suggestion }: { suggestion: AiSuggestion }) {
  const outcome = STATUS_LABEL[suggestion.status as keyof typeof STATUS_LABEL];
  return (
    <div className="space-y-2">
      {outcome && <Pill className={outcome.cls}>{outcome.text}</Pill>}
      {suggestion.applied && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {FIELDS.map(({ key, label, options }) => {
            const applied = suggestion.applied![key];
            const changed = applied !== suggestion.suggested[key].value;
            return (
              <div key={key}>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
                <dd className={cn("font-medium", changed && "text-blue-700")}>
                  {(options as Record<string, string>)[applied]}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
