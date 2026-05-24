import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type KpiAccent = "red" | "orange" | "green" | "blue";

interface KpiCardProps {
  label: string;
  value?: number | string;
  accent?: KpiAccent;
  tooltip?: string;
  icon?: ReactNode;
  description?: string;
  onClick?: () => void;
}

const ACCENT_CLS: Record<KpiAccent, string> = {
  red: "text-red-600",
  orange: "text-orange-500",
  green: "text-green-600",
  blue: "text-blue-600",
};

export function KpiCard({
  label,
  value,
  accent,
  tooltip,
  icon,
  description,
  onClick,
}: KpiCardProps) {
  const numCls = accent ? ACCENT_CLS[accent] : "text-foreground";
  const hasHeader = !!(icon || tooltip);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5",
        onClick &&
          "cursor-pointer hover:border-primary/40 hover:shadow-md transition-all",
      )}
      onClick={onClick}
    >
      <div
        className={cn("flex items-center gap-1", hasHeader ? "mb-3" : "mb-5")}
      >
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <p className="text-xs text-muted-foreground font-medium leading-none">
          {label}
        </p>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 text-muted-foreground/60 cursor-default shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-52 text-xs leading-relaxed px-3 py-2">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {value === undefined ? (
        <Skeleton className="h-10 w-14" />
      ) : (
        <p className={`text-5xl font-light tracking-tight ${numCls}`}>
          {value}
        </p>
      )}

      {description && (
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}
