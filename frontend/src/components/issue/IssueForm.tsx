import { useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Bug, Lightbulb, HelpCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LEVEL_COLORS, STATUS_CONFIG } from "@/lib/theme";
import type { IssueType, ImpactLevel, IssueStatus } from "@/types/issues";

// ─── Schema ───────────────────────────────────────────────────────────────────

function buildSchema(mode: "create" | "edit") {
  return z.object({
    productId:   mode === "create"
                   ? z.string().min(1, "Select a product").regex(/^\d+$/, "Invalid product")
                   : z.string().optional(),
    title:       z.string().min(1, "Title is required").max(200),
    description: z.string().min(1, "Description is required"),
    type:        z.enum(["bug", "feature_request", "question", "incident"]),
    impact:      z.enum(["low", "medium", "high"]),
    urgency:     z.enum(["low", "medium", "high"]),
    status:      z.enum(["new", "in_progress", "on_hold", "resolved", "closed", "cancelled"]).optional(),
  });
}

export type IssueFormValues = z.infer<ReturnType<typeof buildSchema>>;

// ─── Static config ────────────────────────────────────────────────────────────

const ISSUE_TYPE_OPTIONS = [
  { value: "bug"             as IssueType, label: "Bug",      Icon: Bug,           desc: "Something isn't working", iconCls: "text-red-500"    },
  { value: "feature_request" as IssueType, label: "Feature",  Icon: Lightbulb,     desc: "Suggest an improvement",  iconCls: "text-yellow-500" },
  { value: "question"        as IssueType, label: "Question", Icon: HelpCircle,    desc: "Need clarification",      iconCls: "text-blue-500"   },
  { value: "incident"        as IssueType, label: "Incident", Icon: AlertTriangle, desc: "Service disruption",      iconCls: "text-orange-500" },
];

const LEVEL_OPTIONS = [
  { value: "low"    as ImpactLevel, label: "Low"    },
  { value: "medium" as ImpactLevel, label: "Medium" },
  { value: "high"   as ImpactLevel, label: "High"   },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface IssueFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<IssueFormValues>;
  /** Create mode: list of products for the product selector */
  products?: { id: string; name: string }[];
  /** Edit mode: show status select for staff */
  showStatusSelect?: boolean;
  currentStatus?: IssueStatus;
  statusOptions?: IssueStatus[];
  onSubmit: (values: IssueFormValues) => void;
  onCancel?: () => void;
  isPending?: boolean;
  isError?: boolean;
  submitLabel?: string;
  /** Called on every impact/urgency change — lets the create page update the live priority panel */
  onValuesChange?: (values: Pick<IssueFormValues, "impact" | "urgency">) => void;
  /** Called whenever the form dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IssueForm({
  mode,
  defaultValues,
  products,
  showStatusSelect,
  currentStatus,
  statusOptions = [],
  onSubmit,
  onCancel,
  isPending = false,
  isError = false,
  submitLabel,
  onValuesChange,
  onDirtyChange,
}: IssueFormProps) {
  const schema = useMemo(() => buildSchema(mode), [mode]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<IssueFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      type:   "bug",
      impact: "medium",
      urgency: "medium",
      ...defaultValues,
    },
  });

  const selectedType    = useWatch({ control, name: "type" });
  const selectedImpact  = useWatch({ control, name: "impact" });
  const selectedUrgency = useWatch({ control, name: "urgency" });

  // Use refs so effects never become stale when callback identities change
  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => { onValuesChangeRef.current = onValuesChange; });

  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange; });

  useEffect(() => {
    onValuesChangeRef.current?.({ impact: selectedImpact, urgency: selectedUrgency });
  }, [selectedImpact, selectedUrgency]);

  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty);
  }, [isDirty]);

  const label = submitLabel ?? (mode === "create" ? "Submit issue" : "Save changes");
  const isSubmitDisabled = isPending || (mode === "edit" && !isDirty);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Product — create only */}
      {mode === "create" && (
        <div className="space-y-1.5">
          <Label htmlFor="productId">Product</Label>
          <select
            id="productId"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      )}

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
          rows={mode === "create" ? 6 : 5}
          placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behaviour…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
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
          {ISSUE_TYPE_OPTIONS.map(({ value, label: optLabel, Icon, desc, iconCls }) => (
            <button
              key={value}
              type="button"
              onClick={() => setValue("type", value, { shouldDirty: true, shouldValidate: true })}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                selectedType === value
                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <Icon className={cn("size-4.5", iconCls)} />
              <span className="text-xs font-medium leading-tight">{optLabel}</span>
              <span className="text-[10px] leading-tight opacity-70">{desc}</span>
            </button>
          ))}
        </div>
        <input type="hidden" {...register("type")} />
      </div>

      {/* Impact + Urgency */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Impact</Label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {LEVEL_OPTIONS.map(({ value, label: optLabel }) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue("impact", value, { shouldDirty: true, shouldValidate: true })}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition-colors",
                  selectedImpact === value ? LEVEL_COLORS[value].active : LEVEL_COLORS[value].idle,
                )}
              >
                {optLabel}
              </button>
            ))}
          </div>
          <input type="hidden" {...register("impact")} />
        </div>

        <div className="space-y-1.5">
          <Label>Urgency</Label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {LEVEL_OPTIONS.map(({ value, label: optLabel }) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue("urgency", value, { shouldDirty: true, shouldValidate: true })}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition-colors",
                  selectedUrgency === value ? LEVEL_COLORS[value].active : LEVEL_COLORS[value].idle,
                )}
              >
                {optLabel}
              </button>
            ))}
          </div>
          <input type="hidden" {...register("urgency")} />
        </div>
      </div>

      {/* Status — edit mode, staff only */}
      {showStatusSelect && currentStatus && statusOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("status")}
          >
            <option value={currentStatus}>{STATUS_CONFIG[currentStatus]?.label ?? currentStatus}</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>
        </div>
      )}

      {isError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to save. Please try again.
        </p>
      )}

      {/* Actions */}
      <div className={cn("flex gap-2", mode === "create" ? "justify-stretch" : "justify-end")}>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size={mode === "create" ? "default" : "sm"}
          disabled={isSubmitDisabled}
          className={cn(mode === "create" && "w-full")}
        >
          {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {label}
        </Button>
      </div>
    </form>
  );
}
