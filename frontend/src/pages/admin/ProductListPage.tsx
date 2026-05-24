import { useState } from "react";
import { Plus, Package } from "lucide-react";
import { useForm } from "react-hook-form";
import { useProducts, useCreateProduct } from "@/hooks/use-products";
import { useCompanies } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@/components/ui/data-table";
import type { CreateProductInput, Office, Product } from "@/types/products";

const productColumns: ColumnDef<Product>[] = [
  {
    key: "name",
    header: "Product",
    mobile: { primary: true },
    render: (row) => (
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Package className="size-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium">{row.name}</span>
      </div>
    ),
  },
  {
    key: "code",
    header: "Code",
    render: (row) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.code}
      </span>
    ),
  },
  {
    key: "company",
    header: "Company",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{row.company.name}</span>
    ),
  },
  {
    key: "owningOffice",
    header: "Office",
    render: (row) => (
      <Badge variant="outline" className="text-xs">
        {row.owningOffice}
      </Badge>
    ),
  },
  {
    key: "issues",
    header: "Issues",
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {row._count?.issues ?? 0}
      </span>
    ),
  },
];

const OFFICES: { value: Office; label: string }[] = [
  { value: "KR", label: "Korea (KR)" },
  { value: "LK", label: "Sri Lanka (LK)" },
  { value: "IN", label: "India (IN)" },
];

function NewProductDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useCreateProduct();
  const { data: companies = [] } = useCompanies();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProductInput>({
    defaultValues: { owningOffice: "LK" },
  });

  const onSubmit = (values: CreateProductInput) => {
    mutation.mutate(values, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Company */}
          <div className="space-y-1.5">
            <Label htmlFor="companyId">Company</Label>
            <select
              id="companyId"
              {...register("companyId", { required: "Company is required" })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select a company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.companyId && (
              <p className="text-xs text-destructive">
                {errors.companyId.message}
              </p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input
              id="name"
              placeholder="e.g. Cloud Platform"
              {...register("name", {
                required: "Name is required",
                minLength: { value: 2, message: "At least 2 characters" },
              })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Code */}
          <div className="space-y-1.5">
            <Label htmlFor="code">Product code</Label>
            <Input
              id="code"
              placeholder="e.g. CLOUD"
              className="font-mono uppercase"
              {...register("code", {
                required: "Code is required",
                pattern: {
                  value: /^[A-Z0-9_-]+$/i,
                  message: "Letters, numbers, _ and - only",
                },
              })}
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            )}
          </div>

          {/* Owning office */}
          <div className="space-y-1.5">
            <Label htmlFor="owningOffice">Owning office</Label>
            <select
              id="owningOffice"
              {...register("owningOffice", { required: true })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {OFFICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="description">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <textarea
              id="description"
              rows={3}
              placeholder="Brief description of this product…"
              {...register("description")}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              Something went wrong. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductListPage() {
  const { data: products, isLoading } = useProducts();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* ── Title bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold">Products</h1>
          {products && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
              {products.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-3.5 mr-1" />
          New product
        </Button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <DataTable
          variant="page"
          columns={productColumns}
          data={products}
          isLoading={isLoading}
          emptyMessage="No products found."
          mobileRender={(product) => (
            <div className="px-4 py-3.5 border-b active:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Package className="size-3.5 text-primary" />
                </div>
                <span className="text-sm font-medium">{product.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">
                  {product.code}
                </span>
                <span className="text-xs text-muted-foreground">
                  {product.company.name}
                </span>
                <Badge variant="outline" className="text-xs">
                  {product.owningOffice}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {product._count?.issues ?? 0} issues
                </span>
              </div>
            </div>
          )}
        />
      </div>

      <NewProductDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
