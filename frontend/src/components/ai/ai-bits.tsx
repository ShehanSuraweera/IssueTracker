import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marks content as AI-generated, so it's never mistaken for a person's input. */
export function AiTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700",
        className,
      )}
    >
      <Sparkles className="size-2.5" />
      AI
    </span>
  );
}

export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Frustration on the 1–5 scale, as five dots. */
export function FrustrationMeter({ level }: { level: number }) {
  const tone = level >= 4 ? "bg-red-500" : level === 3 ? "bg-amber-500" : "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Frustration ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          className={cn("size-1.5 rounded-full", dot <= level ? tone : "bg-muted")}
        />
      ))}
    </span>
  );
}

export function AiCardMessage({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
