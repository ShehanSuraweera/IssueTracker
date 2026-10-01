import { api } from "./client";
import type {
  ClientHealth,
  EscalationIssue,
  ResolutionSuggestion,
  ReviewInput,
  AiSuggestion,
  SentimentTimeline,
  SimilarIssues,
  SuggestionData,
  ThreadSummary,
  ThreadSummaryData,
} from "@/types/ai";
import type { IssueDetail } from "@/types/issues";

export async function getAiConfig(): Promise<{ enabled: boolean }> {
  const { data } = await api.get<{ data: { enabled: boolean } }>("/ai/config");
  return data.data;
}

// ─── Triage ──────────────────────────────────────────────────────────────────

export async function getSuggestion(issueId: string): Promise<SuggestionData> {
  const { data } = await api.get<{ data: SuggestionData }>(`/issues/${issueId}/ai/suggestion`);
  return data.data;
}

export async function reviewSuggestion(
  issueId: string,
  suggestionId: string,
  input: ReviewInput,
): Promise<{ suggestion: AiSuggestion; issue: IssueDetail | null }> {
  const { data } = await api.post<{
    data: { suggestion: AiSuggestion; issue: IssueDetail | null };
  }>(`/issues/${issueId}/ai/suggestion/${suggestionId}/review`, input);
  return data.data;
}

export async function retryAnalysis(issueId: string): Promise<void> {
  await api.post(`/issues/${issueId}/ai/analyze`);
}

// ─── Sentiment ───────────────────────────────────────────────────────────────

export async function getSentiment(issueId: string): Promise<SentimentTimeline> {
  const { data } = await api.get<{ data: SentimentTimeline }>(`/issues/${issueId}/ai/sentiment`);
  return data.data;
}

// ─── Similar issues and resolutions ──────────────────────────────────────────

export async function getSimilarIssues(issueId: string): Promise<SimilarIssues> {
  const { data } = await api.get<{ data: SimilarIssues }>(`/issues/${issueId}/ai/similar`);
  return data.data;
}

export async function getResolution(issueId: string): Promise<ResolutionSuggestion | null> {
  const { data } = await api.get<{ data: { suggestion: ResolutionSuggestion | null } }>(
    `/issues/${issueId}/ai/resolution`,
  );
  return data.data.suggestion;
}

export async function requestResolution(issueId: string): Promise<ResolutionSuggestion> {
  const { data } = await api.post<{ data: { suggestion: ResolutionSuggestion } }>(
    `/issues/${issueId}/ai/resolution`,
  );
  return data.data.suggestion;
}

export async function giveResolutionFeedback(
  issueId: string,
  resolutionId: string,
  feedback: "helpful" | "not_helpful",
): Promise<ResolutionSuggestion> {
  const { data } = await api.post<{ data: { suggestion: ResolutionSuggestion } }>(
    `/issues/${issueId}/ai/resolution/${resolutionId}/feedback`,
    { feedback },
  );
  return data.data.suggestion;
}

// ─── Thread summary ──────────────────────────────────────────────────────────

export async function getThreadSummary(issueId: string): Promise<ThreadSummaryData> {
  const { data } = await api.get<{ data: ThreadSummaryData }>(`/issues/${issueId}/ai/summary`);
  return data.data;
}

export async function requestThreadSummary(issueId: string): Promise<ThreadSummary> {
  const { data } = await api.post<{ data: { summary: ThreadSummary } }>(
    `/issues/${issueId}/ai/summary`,
  );
  return data.data.summary;
}

// ─── Dashboard insights ──────────────────────────────────────────────────────

export async function getEscalations(): Promise<EscalationIssue[]> {
  const { data } = await api.get<{ data: { issues: EscalationIssue[] } }>("/ai/escalations");
  return data.data.issues;
}

export async function getClientHealth(days: number): Promise<ClientHealth> {
  const { data } = await api.get<{ data: ClientHealth }>("/ai/client-health", {
    params: { days },
  });
  return data.data;
}
