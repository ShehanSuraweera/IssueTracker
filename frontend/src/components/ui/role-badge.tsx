import { cn } from "@/lib/utils";
import { ROLE_COLORS, ROLE_LABEL } from "@/lib/theme";
import type { UserRole } from "@/types/users";

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const cls   = ROLE_COLORS[role] ?? "";
  const label = ROLE_LABEL[role]  ?? role;
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
