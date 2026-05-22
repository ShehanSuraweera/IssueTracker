import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, Loader2, Bug, Lightbulb, HelpCircle, AlertTriangle, Info,
} from "lucide-react";
import { useCreateIssue } from "@/hooks/use-issues";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, LEVEL_COLORS } from "@/lib/theme";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  productId:   z.string().min(1, "Select a product"),
  title:       z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required"),
  type:        z.enum(["bug", "feature_request", "question", "incident"]),
  impact:      z.enum(["low", "medium", "high"]),
  urgency:     z.enum(["low", "medium", "high"]),
});

type FormValues = z.infer<typeof schema>;

// ─── Static config ────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "bug"             as const, label: "Bug",      Icon: Bug,           desc: "Something isn't working", iconCls: "text-red-500"    },
  { value: "feature_request" as const, label: "Feature",  Icon: Lightbulb,     desc: "Suggest an improvement",  iconCls: "text-yellow-500" },
  { value: "question"        as const, label: "Question", Icon: HelpCircle,    desc: "Need clarification",      iconCls: "text-blue-500"   },
  { value: "incident"        as const, label: "Incident", Icon: AlertTriangle, desc: "Service disruption",      iconCls: "text-orange-500" },
];

const LEVEL_OPTIONS = [
  { value: "low"    as const, label: "Low"    },
  { value: "medium" as const, label: "Medium" },
  { value: "high"   as const, label: "High"   },
];

// ITIL-derived impact × urgency → priority
const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  high:   { low: "moderate", medium: "high",     high: "critical" },
  medium: { low: "low",      medium: "moderate", high: "high"     },
  low:    { low: "low",      medium: "low",       high: "moderate" },
};


const TIPS = [
  "Use a specific title — avoid vague terms like \"it broke\"",
  "Include exact steps to reproduce for bugs",
  "Note which environment you saw this in (prod, staging…)",
  "Attach screenshots or logs if available",
];

const SHORT: Record<string, string> = {
  critical: "Crit", high: "High", moderate: "Mod", low: "Low",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IssueCreatePage() {
  const navigate          = useNavigate();
  const { data: products } = useProducts();
  const mutation          = useCreateIssue();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver:      zodResolver(schema) as any,
    defaultValues: { type: "bug", impact: "medium", urgency: "medium" },
  });

  const [selectedType, selectedImpact, selectedUrgency] = watch(["type", "impact", "urgency"]);
  const derivedPriority = PRIORITY_MATRIX[selectedImpact]?.[selectedUrgency] ?? "low";

  function onSubmit(values: FormValues) {
    mutation.mutate(values, {
      onSuccess: (issue) => navigate(`/issues/${issue.id}`),
    });
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>

      <div className="grid grid-cols-[1fr_288px] gap-8 items-start">

        {/* ── Left: form ─────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <h1 className="text-xl font-semibold">New Issue</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Report a problem, ask a question, or request a feature.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <Label htmlFor="productId">Product</Label>
            <select
              id="productId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("productId")}
            >
              <option value="">Select a product…</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.productId && (
              <p className="text-xs text-destructive">{errors.productId.message}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Brief summary of the issue" {...register("title")} />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={6}
              placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behaviour…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Type — icon cards */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map(({ value, label, Icon, desc, iconCls }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue("type", value, { shouldValidate: true })}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                    selectedType === value
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <Icon className={cn("size-4.5", iconCls)} />
                  <span className="text-xs font-medium leading-tight">{label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{desc}</span>
                </button>
              ))}
            </div>
            <input type="hidden" {...register("type")} />
          </div>

          {/* Impact + Urgency — segmented controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Impact</Label>
              <div className="flex rounded-md border border-input overflow-hidden">
                {LEVEL_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue("impact", value, { shouldValidate: true })}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium transition-colors",
                      selectedImpact === value
                        ? LEVEL_COLORS[value].active
                        : LEVEL_COLORS[value].idle,
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input type="hidden" {...register("impact")} />
            </div>

            <div className="space-y-1.5">
              <Label>Urgency</Label>
              <div className="flex rounded-md border border-input overflow-hidden">
                {LEVEL_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue("urgency", value, { shouldValidate: true })}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium transition-colors",
                      selectedUrgency === value
                        ? LEVEL_COLORS[value].active
                        : LEVEL_COLORS[value].idle,
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input type="hidden" {...register("urgency")} />
            </div>
          </div>

          {mutation.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Failed to create issue. Please try again.
            </p>
          )}

          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Submit issue
          </Button>
        </form>

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
                {LEVEL_OPTIONS.map(({ value, label }) => (
                  <div
                    key={value}
                    className={cn(
                      "text-center py-1 font-medium rounded-t",
                      selectedUrgency === value ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label.slice(0, 3)}
                  </div>
                ))}

                {/* Data rows — high → medium → low impact */}
                {(["high", "medium", "low"] as const).flatMap(imp => [
                  <div
                    key={`lbl-${imp}`}
                    className={cn(
                      "py-1 pr-1.5 font-medium capitalize text-right",
                      selectedImpact === imp ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {imp === "medium" ? "Med" : imp.slice(0, 4)}
                  </div>,
                  ...(["low", "medium", "high"] as const).map(urg => {
                    const p       = PRIORITY_MATRIX[imp][urg];
                    const isActive = selectedImpact === imp && selectedUrgency === urg;
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
