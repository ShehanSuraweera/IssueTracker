// Types mirroring the backend's AI endpoints (/api/ai/* and /api/issues/:id/ai/*).
import type {
  EngineeringTeam,
  ImpactLevel,
  IssueCategory,
  IssueStatus,
  PriorityLevel,
  UrgencyLevel,
} from "./issues";

export type Level = "low" | "medium" | "high";
export type Sentiment = "negative" | "neutral" | "positive";

// ─── Triage suggestion ───────────────────────────────────────────────────────

export type AnalysisStatus = "none" | "queued" | "running" | "done" | "failed";
export type SuggestionStatus = "pending" | "accepted" | "edited" | "rejected" | "superseded";

export interface Suggested<T> {
  value: T;
  reason: string;
}

export interface TriageValues {
  impact: ImpactLevel;
  urgency: UrgencyLevel;
  category: IssueCategory;
  team: EngineeringTeam;
}

export interface AiSuggestion {
  id: string;
  issueId: string;
  status: SuggestionStatus;
  suggested: {
    impact: Suggested<ImpactLevel>;
    urgency: Suggested<UrgencyLevel>;
    category: Suggested<IssueCategory>;
    team: Suggested<EngineeringTeam>;
  };
  applied: TriageValues | null;
  manipulationAttempt: boolean;
  model: string;
  promptVersion: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface SuggestionData {
  analysis: {
    status: AnalysisStatus;
    attempts: number;
    lastErrorCode: string | null;
    updatedAt: string | null;
  };
  suggestion: AiSuggestion | null;
}

export type ReviewInput = ({ action: "apply" } & Partial<TriageValues>) | { action: "reject" };

// ─── Sentiment ───────────────────────────────────────────────────────────────

export interface SentimentEntry {
  id: string;
  source: "issue" | "comment";
  commentId: string | null;
  sentiment: Sentiment;
  frustrationLevel: number;
  escalationRisk: Level;
  evidenceQuote: string;
  reason: string;
  manipulationAttempt: boolean;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface SentimentTimeline {
  entries: SentimentEntry[];
  latest: SentimentEntry | null;
  peakFrustration: number | null;
}

// ─── Similar issues and suggested resolutions ────────────────────────────────

export interface SimilarIssue {
  issueId: string;
  ticketNumber: string;
  title: string;
  status: IssueStatus;
  productName: string;
  resolvedAt: string | null;
  similarity: number;
}

export interface SimilarIssues {
  results: SimilarIssue[];
  minSimilarity: number;
}

export interface ResolutionSuggestion {
  // null when no similar history existed and nothing was stored
  id: string | null;
  hasRelevantHistory: boolean;
  summary: string;
  steps: string[];
  citedTickets: string[];
  sources: SimilarIssue[];
  confidence: Level;
  manipulationAttempt: boolean;
  model: string | null;
  promptVersion: string | null;
  feedback: "helpful" | "not_helpful" | null;
  createdAt: string;
}

// ─── Thread summary ──────────────────────────────────────────────────────────

export interface KeyPoint {
  text: string;
  // Comment IDs, or "description" for the issue description
  commentIds: string[];
}

export interface ThreadSummary {
  id: string;
  summary: string;
  keyPoints: KeyPoint[];
  openQuestions: string[];
  manipulationAttempt: boolean;
  commentCount: number;
  stale: boolean;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface ThreadSummaryData {
  summary: ThreadSummary | null;
  commentCount: number;
  minimumComments: number;
}

// ─── Escalation risk and client health ───────────────────────────────────────

export interface EscalationIssue {
  issueId: string;
  ticketNumber: string;
  title: string;
  status: IssueStatus;
  priority: PriorityLevel;
  productName: string;
  companyId: string;
  companyName: string;
  frustrationLevel: number;
  sentiment: Sentiment;
  evidenceQuote: string;
  assessedAt: string;
}

export type HealthTrend = "improving" | "stable" | "worsening" | "insufficient_data";

export interface ClientHealthWeek {
  weekStart: string;
  entries: number;
  avgFrustration: number;
  negativeShare: number;
  highRisk: number;
}

export interface ClientHealthCompany {
  companyId: string;
  name: string;
  region: string;
  weeks: ClientHealthWeek[];
  recentAvgFrustration: number | null;
  previousAvgFrustration: number | null;
  trend: HealthTrend;
  openHighRiskIssues: number;
}

export interface ClientHealth {
  days: number;
  companies: ClientHealthCompany[];
}
