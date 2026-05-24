import { cn } from "@/lib/utils";
import { IMPACT_BADGE } from "@/lib/theme";
import type { ImpactLevel } from "@/types/issues";

interface ImpactBadgeProps {
  impact: ImpactLevel;
  className?: string;
}

export function ImpactBadge({ impact, className }: ImpactBadgeProps) {
  const cls = IMPACT_BADGE[impact] ?? "";
  const label = impact.charAt(0).toUpperCase() + impact.slice(1);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}
