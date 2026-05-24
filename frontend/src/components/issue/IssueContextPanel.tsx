import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG } from "@/lib/theme";
import type { ImpactLevel, UrgencyLevel } from "@/types/issues";

const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  high: { low: "moderate", medium: "high", high: "critical" },
  medium: { low: "low", medium: "moderate", high: "high" },
  low: { low: "low", medium: "low", high: "moderate" },
};

const LEVEL_HEADERS = ["Low", "Med", "High"];
const IMPACT_ROWS = ["high", "medium", "low"] as const;
const URGENCY_COLS = ["low", "medium", "high"] as const;

const SHORT: Record<string, string> = {
  critical: "Crit",
  high: "High",
  moderate: "Mod",
  low: "Low",
};

interface Props {
  impact: ImpactLevel;
  urgency: UrgencyLevel;
  tips: string[];
  tipsTitle?: string;
}

export function IssueContextPanel({
  impact,
  urgency,
  tips,
  tipsTitle = "Tips",
}: Props) {
  const [showPanel, setShowPanel] = useState(false);
  const derivedPriority = PRIORITY_MATRIX[impact]?.[urgency] ?? "low";

  return (
    <div className="lg:sticky lg:top-6">
      <button
        className="lg:hidden w-full flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium mb-3"
        onClick={() => setShowPanel((v) => !v)}
      >
        <span className="flex items-center gap-1.5">
          <Info className="size-3.5 text-muted-foreground" />
          Priority &amp; Tips
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            showPanel && "rotate-180",
          )}
        />
      </button>

      <div className={cn("space-y-4", !showPanel && "hidden lg:block")}>
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Derived Priority</p>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold capitalize",
                PRIORITY_CONFIG[derivedPriority as keyof typeof PRIORITY_CONFIG]
                  ?.cls,
              )}
            >
              {derivedPriority}
            </span>
            <span className="text-xs text-muted-foreground">
              impact × urgency
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Priority matrix
              </p>
              <span className="text-[10px] text-muted-foreground">
                ← urgency →
              </span>
            </div>

            <div className="grid grid-cols-4 gap-0.5 text-[10px]">
              <div className="py-1 text-muted-foreground text-right pr-1.5 font-medium">
                Impact
              </div>
              {URGENCY_COLS.map((col, i) => (
                <div
                  key={col}
                  className={cn(
                    "text-center py-1 font-medium rounded-t",
                    urgency === col
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {LEVEL_HEADERS[i]}
                </div>
              ))}

              {IMPACT_ROWS.flatMap((imp) => [
                <div
                  key={`lbl-${imp}`}
                  className={cn(
                    "py-1 pr-1.5 font-medium capitalize text-right",
                    impact === imp
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {imp === "medium" ? "Med" : imp.slice(0, 4)}
                </div>,
                ...URGENCY_COLS.map((urg) => {
                  const p = PRIORITY_MATRIX[imp][urg];
                  const isActive = impact === imp && urgency === urg;
                  return (
                    <div
                      key={`${imp}-${urg}`}
                      className={cn(
                        "text-center py-1 rounded font-medium transition-all",
                        PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG]?.cls,
                        isActive &&
                          "ring-2 ring-offset-0 ring-foreground/25 scale-105",
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

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <Info className="size-3.5 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium">{tipsTitle}</p>
          </div>
          <ol className="space-y-2">
            {tips.map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
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
  );
}
