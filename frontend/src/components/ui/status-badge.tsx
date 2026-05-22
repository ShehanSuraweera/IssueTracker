import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/lib/theme";
import type { IssueStatus } from "@/types/issues";

interface StatusBadgeProps {
  status: IssueStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, cls } = STATUS_CONFIG[status] ?? { label: status, cls: "" };
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
