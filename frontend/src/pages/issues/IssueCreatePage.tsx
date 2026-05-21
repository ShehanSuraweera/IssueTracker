import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useCreateIssue } from "@/hooks/use-issues";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z.object({
  productId:   z.string().min(1, "Select a product"),
  title:       z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required"),
  type:        z.enum(["bug", "feature_request", "question", "incident"]),
  impact:      z.enum(["low", "medium", "high"]),
  urgency:     z.enum(["low", "medium", "high"]),
});

type FormValues = z.infer<typeof schema>;

export default function IssueCreatePage() {
  const navigate = useNavigate();

  const { data: products } = useProducts();
  const mutation = useCreateIssue();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { impact: "medium", urgency: "medium" },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate(values, {
      onSuccess: (issue) => navigate(`/issues/${issue.id}`),
    });
  }

  return (
    <div className="max-w-xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New Issue</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

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
              {errors.productId && <p className="text-xs text-destructive">{errors.productId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="Brief summary of the issue" {...register("title")} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={5}
                placeholder="Describe the issue in detail, steps to reproduce, expected vs actual behaviour…"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                {...register("description")}
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...register("type")}
                >
                  <option value="bug">Bug</option>
                  <option value="feature_request">Feature request</option>
                  <option value="question">Question</option>
                  <option value="incident">Incident</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="impact">Impact</Label>
                <select
                  id="impact"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...register("impact")}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="urgency">Urgency</Label>
                <select
                  id="urgency"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...register("urgency")}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {mutation.isError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Failed to create issue. Please try again.
              </p>
            )}

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Submit issue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
