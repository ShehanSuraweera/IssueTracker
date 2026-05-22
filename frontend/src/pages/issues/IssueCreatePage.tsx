import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { useCreateIssue } from "@/hooks/use-issues";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG } from "@/lib/theme";
import { IssueForm } from "@/components/issue/IssueForm";
import type { ImpactLevel, UrgencyLevel } from "@/types/issues";

// ─── Priority matrix ──────────────────────────────────────────────────────────

// ITIL-derived impact × urgency → priority
const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  high:   { low: "moderate", medium: "high",     high: "critical" },
  medium: { low: "low",      medium: "moderate", high: "high"     },
  low:    { low: "low",      medium: "low",       high: "moderate" },
};

const LEVEL_HEADERS = ["Low", "Med", "High"];
const IMPACT_ROWS   = ["high", "medium", "low"] as const;
const URGENCY_COLS  = ["low", "medium", "high"] as const;

const SHORT: Record<string, string> = {
  critical: "Crit", high: "High", moderate: "Mod", low: "Low",
};

const TIPS = [
  "Use a specific title — avoid vague terms like \"it broke\"",
  "Include exact steps to reproduce for bugs",
  "Note which environment you saw this in (prod, staging…)",
  "Attach screenshots or logs if available",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IssueCreatePage() {
  const navigate           = useNavigate();
  const { data: products } = useProducts();
  const mutation           = useCreateIssue();

  const [liveValues, setLiveValues] = useState<{ impact: ImpactLevel; urgency: UrgencyLevel }>({
    impact: "medium",
    urgency: "medium",
  });

  const derivedPriority = PRIORITY_MATRIX[liveValues.impact]?.[liveValues.urgency] ?? "low";

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>

      <div className="grid grid-cols-[1fr_288px] gap-8 items-start">

        {/* ── Left: form ─────────────────────────────────────── */}
        <div>
          <div className="mb-5">
            <h1 className="text-xl font-semibold">New Issue</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Report a problem, ask a question, or request a feature.
            </p>
          </div>

          <IssueForm
            mode="create"
            products={products}
            defaultValues={{ type: "bug", impact: "medium", urgency: "medium" }}
            onSubmit={(values) =>
              mutation.mutate(
                { ...values, productId: values.productId! },
                { onSuccess: (issue) => navigate(`/issues/${issue.id}`) },
              )
            }
            isPending={mutation.isPending}
            isError={mutation.isError}
            onValuesChange={setLiveValues}
          />
        </div>

        {/* ── Right: context panel ────────────────────────────── */}
        <div className="space-y-4 sticky top-6">

          {/* Live priority preview */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Derived Priority</p>

            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold capitalize",
                PRIORITY_CONFIG[derivedPriority as keyof typeof PRIORITY_CONFIG]?.cls,
              )}>
                {derivedPriority}
              </span>
              <span className="text-xs text-muted-foreground">impact × urgency</span>
            </div>

            {/* 3×3 matrix */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Priority matrix
                </p>
                <span className="text-[10px] text-muted-foreground">← urgency →</span>
              </div>

              <div className="grid grid-cols-4 gap-0.5 text-[10px]">
                {/* Header row */}
                <div className="py-1 text-muted-foreground text-right pr-1.5 font-medium">Impact</div>
                {URGENCY_COLS.map((col, i) => (
                  <div
                    key={col}
                    className={cn(
                      "text-center py-1 font-medium rounded-t",
                      liveValues.urgency === col ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {LEVEL_HEADERS[i]}
                  </div>
                ))}

                {/* Data rows */}
                {IMPACT_ROWS.flatMap(imp => [
                  <div
                    key={`lbl-${imp}`}
                    className={cn(
                      "py-1 pr-1.5 font-medium capitalize text-right",
                      liveValues.impact === imp ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {imp === "medium" ? "Med" : imp.slice(0, 4)}
                  </div>,
                  ...URGENCY_COLS.map(urg => {
                    const p        = PRIORITY_MATRIX[imp][urg];
                    const isActive = liveValues.impact === imp && liveValues.urgency === urg;
                    return (
                      <div
                        key={`${imp}-${urg}`}
                        className={cn(
                          "text-center py-1 rounded font-medium transition-all",
                          PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG]?.cls,
                          isActive && "ring-2 ring-offset-0 ring-foreground/25 scale-105",
                        )}
                      >
                        {SHORT[p]}
                      </div>
                    );
                  }),
                ])}
              </div>
            </div>
          </div>

          {/* Submission tips */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Info className="size-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium">Tips for a good report</p>
            </div>
            <ol className="space-y-2">
              {TIPS.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-0.5 size-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
