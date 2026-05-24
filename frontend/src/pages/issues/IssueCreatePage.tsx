import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCreateIssue } from "@/hooks/use-issues";
import { useProducts } from "@/hooks/use-products";
import { useBack } from "@/hooks/use-back";
import { Button } from "@/components/ui/button";
import { IssueForm } from "@/components/issue/IssueForm";
import { IssueContextPanel } from "@/components/issue/IssueContextPanel";
import type { ImpactLevel, UrgencyLevel } from "@/types/issues";

const TIPS = [
  'Use a specific title — avoid vague terms like "it broke"',
  "Include exact steps to reproduce for bugs",
  "Note which environment you saw this in (prod, staging…)",
  "Attach screenshots or logs if available",
];

export default function IssueCreatePage() {
  const navigate = useNavigate();
  const back = useBack("/issues");
  const { data: products } = useProducts();
  const mutation = useCreateIssue();

  const [liveValues, setLiveValues] = useState<{
    impact: ImpactLevel;
    urgency: UrgencyLevel;
  }>({
    impact: "medium",
    urgency: "medium",
  });

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6 lg:gap-8 items-start">
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
        <IssueContextPanel
          impact={liveValues.impact}
          urgency={liveValues.urgency}
          tips={TIPS}
          tipsTitle="Tips for a good report"
        />
      </div>
    </div>
  );
}
