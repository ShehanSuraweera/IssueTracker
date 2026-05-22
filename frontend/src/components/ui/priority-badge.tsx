import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG } from "@/lib/theme";
import type { PriorityLevel } from "@/types/issues";

interface PriorityBadgeProps {
  priority: PriorityLevel;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const { label, cls } = PRIORITY_CONFIG[priority] ?? { label: priority, cls: "" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        cls,
        className
      )}
    >
      {label}
    </span>
  );
}
