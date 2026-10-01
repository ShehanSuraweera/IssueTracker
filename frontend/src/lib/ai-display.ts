import type { EngineeringTeam, IssueCategory } from "@/types/issues";
import type { HealthTrend, Level, Sentiment } from "@/types/ai";

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  authentication_access: "Authentication & access",
  notifications: "Notifications",
  data_integrity: "Data integrity",
  performance: "Performance",
  ui_display: "UI & display",
  crash_error: "Crash or error",
  file_handling: "File handling",
  integrations: "Integrations",
  reporting_analytics: "Reporting & analytics",
  other: "Other",
};

export const TEAM_LABEL: Record<EngineeringTeam, string> = {
  mobile: "Mobile",
  web_frontend: "Web frontend",
  backend: "Backend",
  data_platform: "Data platform",
  infrastructure: "Infrastructure",
  support: "Support",
};

export const LEVEL_LABEL: Record<Level, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const SENTIMENT_STYLE: Record<Sentiment, { label: string; cls: string }> = {
  negative: { label: "Negative", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  neutral: { label: "Neutral", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  positive: { label: "Positive", cls: "bg-green-100 text-green-700 border-green-200" },
};

export const RISK_STYLE: Record<Level, { label: string; cls: string }> = {
  low: { label: "Low risk", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  medium: { label: "Medium risk", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  high: { label: "High risk", cls: "bg-red-100 text-red-700 border-red-200" },
};

export const CONFIDENCE_STYLE: Record<Level, { label: string; cls: string }> = {
  low: { label: "Low confidence", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  medium: { label: "Medium confidence", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  high: { label: "High confidence", cls: "bg-green-100 text-green-700 border-green-200" },
};

export const TREND_STYLE: Record<HealthTrend, { label: string; cls: string }> = {
  worsening: { label: "Worsening", cls: "bg-red-100 text-red-700 border-red-200" },
  stable: { label: "Stable", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  improving: { label: "Improving", cls: "bg-green-100 text-green-700 border-green-200" },
  insufficient_data: {
    label: "Not enough data",
    cls: "bg-muted text-muted-foreground border-transparent",
  },
};
