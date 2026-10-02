import { Link } from "react-router-dom";
import { Lightbulb, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useRequestResolution,
  useResolution,
  useResolutionFeedback,
  useSimilarIssues,
} from "@/hooks/use-ai";
import { CONFIDENCE_STYLE } from "@/lib/ai-display";
import type { ResolutionSuggestion } from "@/types/ai";
import { AiCardMessage, AiTag, Pill } from "./ai-bits";

/**
 * Resolved issues from the same company that look like this one, and a
 * suggested fix grounded in them. Only issues the viewer can open are shown.
 */
export function SimilarIssuesCard({ issueId }: { issueId: string }) {
  const similar = useSimilarIssues(issueId, true);

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          Similar resolved issues <AiTag />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {similar.isLoading && <Skeleton className="h-16 w-full" />}
        {similar.isError && <AiCardMessage>Similar issues are unavailable right now.</AiCardMessage>}
        {similar.data && similar.data.results.length === 0 && (
          <AiCardMessage>No similar resolved issues for this client yet.</AiCardMessage>
        )}
        {similar.data && similar.data.results.length > 0 && (
          <ul className="space-y-2">
            {similar.data.results.map((r) => (
              <li key={r.issueId}>
                <Link
                  to={`/issues/${r.issueId}`}
                  className="group block rounded-md border p-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{r.ticketNumber}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(r.similarity * 100)}% match
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs font-medium group-hover:underline">{r.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ResolutionSection issueId={issueId} />
      </CardContent>
    </Card>
  );
}

function ResolutionSection({ issueId }: { issueId: string }) {
  const latest = useResolution(issueId, true);
  const request = useRequestResolution(issueId);
  const suggestion = latest.data;

  return (
    <div className="space-y-2 border-t pt-3">
      {suggestion && <ResolutionView issueId={issueId} suggestion={suggestion} />}
      <Button
        size="sm"
        variant={suggestion ? "outline" : "default"}
        className="h-7 w-full text-xs"
        disabled={request.isPending}
        onClick={() => request.mutate()}
      >
        {request.isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Lightbulb className="mr-1.5 size-3.5" />
        )}
        {request.isPending ? "Thinking…" : suggestion ? "Suggest again" : "Suggest a fix"}
      </Button>
    </div>
  );
}

function ResolutionView({ issueId, suggestion }: { issueId: string; suggestion: ResolutionSuggestion }) {
  const feedback = useResolutionFeedback(issueId);
  const sourceByTicket = new Map(suggestion.sources.map((s) => [s.ticketNumber, s]));

  if (!suggestion.hasRelevantHistory) {
    return <AiCardMessage>{suggestion.summary}</AiCardMessage>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Suggested fix
        </p>
        <Pill className={CONFIDENCE_STYLE[suggestion.confidence].cls}>
          {CONFIDENCE_STYLE[suggestion.confidence].label}
        </Pill>
      </div>
      <p className="text-xs leading-relaxed">{suggestion.summary}</p>
      <ol className="list-decimal space-y-1 pl-4 text-xs">
        {suggestion.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {suggestion.citedTickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          Based on
          {suggestion.citedTickets.map((ticket) => {
            const source = sourceByTicket.get(ticket);
            return source ? (
              <Link
                key={ticket}
                to={`/issues/${source.issueId}`}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground hover:underline"
              >
                {ticket}
              </Link>
            ) : null;
          })}
        </div>
      )}
      {suggestion.id && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {suggestion.feedback ? (
            <span>Marked {suggestion.feedback === "helpful" ? "helpful" : "not helpful"}</span>
          ) : (
            <>
              Was this helpful?
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Helpful"
                disabled={feedback.isPending}
                onClick={() => feedback.mutate({ id: suggestion.id!, feedback: "helpful" })}
              >
                <ThumbsUp className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Not helpful"
                disabled={feedback.isPending}
                onClick={() => feedback.mutate({ id: suggestion.id!, feedback: "not_helpful" })}
              >
                <ThumbsDown className="size-3" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
