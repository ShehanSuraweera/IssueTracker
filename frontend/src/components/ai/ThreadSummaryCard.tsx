import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequestThreadSummary, useThreadSummary } from "@/hooks/use-ai";
import { relTime } from "@/lib/format";
import type { IssueDetail } from "@/types/issues";
import { AiCardMessage, AiTag, Pill } from "./ai-bits";

/** Admin-only summary of a long comment thread. Each key point cites its source. */
export function ThreadSummaryCard({ issue }: { issue: IssueDetail }) {
  const { data, isLoading, isError } = useThreadSummary(issue.id, true);
  const request = useRequestThreadSummary(issue.id);

  // Comment IDs mean nothing to a reader; show their position in the thread
  const position = new Map(issue.comments.map((c, i) => [c.id, i + 1]));
  const citationLabel = (id: string) =>
    id === "description" ? "Description" : position.has(id) ? `#${position.get(id)}` : null;

  const summary = data?.summary;
  const tooShort = !!data && data.commentCount < data.minimumComments;

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          Thread summary <AiTag />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {isError && <AiCardMessage>Summaries are unavailable right now.</AiCardMessage>}

        {summary && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              {summary.stale && (
                <Pill className="border-amber-200 bg-amber-100 text-amber-700">
                  {data.commentCount - summary.commentCount} new since
                </Pill>
              )}
              <span>{relTime(new Date(summary.createdAt).getTime())}</span>
            </div>
            <p className="text-xs leading-relaxed">{summary.summary}</p>
            <ul className="space-y-1.5">
              {summary.keyPoints.map((point) => (
                <li key={point.text} className="text-xs leading-snug">
                  <span>{point.text}</span>{" "}
                  {point.commentIds.map((id) => {
                    const label = citationLabel(id);
                    return label ? (
                      <span
                        key={id}
                        className="ml-0.5 rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground"
                      >
                        {label}
                      </span>
                    ) : null;
                  })}
                </li>
              ))}
            </ul>
            {summary.openQuestions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Still open
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {summary.openQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {data && (
          <Button
            size="sm"
            variant={summary ? "outline" : "default"}
            className="h-7 w-full text-xs"
            disabled={request.isPending || tooShort}
            onClick={() => request.mutate()}
          >
            {request.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : summary ? (
              <RefreshCw className="mr-1.5 size-3.5" />
            ) : (
              <ScrollText className="mr-1.5 size-3.5" />
            )}
            {request.isPending ? "Summarising…" : summary ? "Summarise again" : "Summarise thread"}
          </Button>
        )}
        {tooShort && !summary && (
          <AiCardMessage>Available once the thread has {data.minimumComments} comments.</AiCardMessage>
        )}
      </CardContent>
    </Card>
  );
}
