import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAiConfig,
  getClientHealth,
  getEscalations,
  getResolution,
  getSentiment,
  getSimilarIssues,
  getSuggestion,
  getThreadSummary,
  giveResolutionFeedback,
  requestResolution,
  requestThreadSummary,
  retryAnalysis,
  reviewSuggestion,
} from "@/api/ai";
import { queryKeys } from "./query-keys";
import { getApiError } from "@/lib/utils";
import type { ReviewInput, SuggestionData } from "@/types/ai";

// Every AI hook takes `enabled`. Pages pass false for clients and when the AI
// layer is switched off, so those users never send AI requests at all.

/** True only once the backend has confirmed AI is on; false while loading. */
export function useAiEnabled(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.ai.config(),
    queryFn: getAiConfig,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.enabled === true;
}

// ─── Triage ──────────────────────────────────────────────────────────────────

const ANALYSIS_IN_FLIGHT = new Set(["queued", "running"]);

export function useAiSuggestion(issueId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.suggestion(issueId),
    queryFn: () => getSuggestion(issueId),
    enabled,
    retry: false,
    // Poll while the background job is working, then stop
    refetchInterval: (query) => {
      const status = (query.state.data as SuggestionData | undefined)?.analysis.status;
      return status && ANALYSIS_IN_FLIGHT.has(status) ? 3_000 : false;
    },
  });
}

export function useReviewSuggestion(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, input }: { suggestionId: string; input: ReviewInput }) =>
      reviewSuggestion(issueId, suggestionId, input),
    onSuccess: (result) => {
      const outcome = result.suggestion.status;
      toast.success(
        outcome === "rejected"
          ? "Suggestion rejected"
          : outcome === "edited"
            ? "Applied with your changes"
            : "Suggestion applied",
      );
      qc.invalidateQueries({ queryKey: queryKeys.ai.suggestion(issueId) });
      // Applying changes impact, urgency, priority and the activity log
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      qc.invalidateQueries({ queryKey: queryKeys.issues.all() });
    },
    onError: (err) => toast.error(getApiError(err, "Failed to review suggestion")),
  });
}

export function useRetryAnalysis(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => retryAnalysis(issueId),
    onSuccess: () => {
      toast.success("Analysis queued");
      qc.invalidateQueries({ queryKey: queryKeys.ai.suggestion(issueId) });
    },
    onError: (err) => toast.error(getApiError(err, "Failed to queue analysis")),
  });
}

// ─── Sentiment ───────────────────────────────────────────────────────────────

export function useSentimentTimeline(issueId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.sentiment(issueId),
    queryFn: () => getSentiment(issueId),
    enabled,
    retry: false,
    // New client comments are analysed in the background
    refetchInterval: 30_000,
  });
}

// ─── Similar issues and resolutions ──────────────────────────────────────────

export function useSimilarIssues(issueId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.similar(issueId),
    queryFn: () => getSimilarIssues(issueId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useResolution(issueId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.resolution(issueId),
    queryFn: () => getResolution(issueId),
    enabled,
    retry: false,
  });
}

export function useRequestResolution(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestResolution(issueId),
    onSuccess: (suggestion) => qc.setQueryData(queryKeys.ai.resolution(issueId), suggestion),
    onError: (err) => toast.error(getApiError(err, "Couldn't suggest a fix")),
  });
}

export function useResolutionFeedback(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: "helpful" | "not_helpful" }) =>
      giveResolutionFeedback(issueId, id, feedback),
    onSuccess: (suggestion) => {
      toast.success("Thanks for the feedback");
      qc.setQueryData(queryKeys.ai.resolution(issueId), suggestion);
    },
    onError: (err) => toast.error(getApiError(err, "Failed to record feedback")),
  });
}

// ─── Thread summary ──────────────────────────────────────────────────────────

export function useThreadSummary(issueId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.summary(issueId),
    queryFn: () => getThreadSummary(issueId),
    enabled,
    retry: false,
  });
}

export function useRequestThreadSummary(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestThreadSummary(issueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ai.summary(issueId) }),
    onError: (err) => toast.error(getApiError(err, "Couldn't summarise the thread")),
  });
}

// ─── Dashboard insights ──────────────────────────────────────────────────────

export function useEscalations(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.escalations(),
    queryFn: getEscalations,
    enabled,
    retry: false,
    refetchInterval: 60_000,
  });
}

export function useClientHealth(days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ai.clientHealth(days),
    queryFn: () => getClientHealth(days),
    enabled,
    retry: false,
  });
}
