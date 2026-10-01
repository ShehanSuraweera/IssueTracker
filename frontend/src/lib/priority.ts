import type { ImpactLevel, PriorityLevel, UrgencyLevel } from "@/types/issues";

// ITIL impact × urgency matrix. Mirrors the backend (issues.service.ts), which
// is the source of truth; this copy only previews the result in the UI.
export const PRIORITY_MATRIX: Record<ImpactLevel, Record<UrgencyLevel, PriorityLevel>> = {
  high: { low: "moderate", medium: "high", high: "critical" },
  medium: { low: "low", medium: "moderate", high: "high" },
  low: { low: "low", medium: "low", high: "moderate" },
};

export function derivePriority(impact: ImpactLevel, urgency: UrgencyLevel): PriorityLevel {
  return PRIORITY_MATRIX[impact][urgency];
}
