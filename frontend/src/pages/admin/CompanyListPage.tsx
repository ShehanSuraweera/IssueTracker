import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useCompanies, useCreateCompany } from "@/hooks/use-companies";
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
import type { CreateCompanyInput, Region, Company } from "@/types/companies";

const companyColumns: ColumnDef<Company>[] = [
  {
    key: "name",
    header: "Company",
    mobile: { primary: true },
    render: (row) => (
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Building2 className="size-3.5 text-primary" />
        </div>
        <Link
          to={`/admin/companies/${row.id}`}
          className="text-sm font-medium hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {row.name}
        </Link>
      </div>
    ),
  },
  {
    key: "contactEmail",
    header: "Contact",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{row.contactEmail}</span>
    ),
  },
  {
    key: "region",
    header: "Region",
    render: (row) => (
      <Badge variant="secondary" className="text-xs">
        {row.region}
      </Badge>
    ),
  },
  {
    key: "products",
    header: "Products",
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {row._count?.products ?? 0}
      </span>
    ),
  },
  {
    key: "users",
    header: "Users",
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {row._count?.users ?? 0}
      </span>
    ),
  },
];

const REGIONS: { value: Region; label: string }[] = [
  { value: "KR", label: "Korea (KR)" },
  { value: "LK", label: "Sri Lanka (LK)" },
  { value: "IN", label: "India (IN)" },
  { value: "GLOBAL", label: "Global" },
];

function NewCompanyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useCreateCompany();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCompanyInput>({
    defaultValues: { region: "GLOBAL" },
  });

  const onSubmit = (values: CreateCompanyInput) => {
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
          <DialogTitle>New Company</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              {...register("name", {
                required: "Name is required",
                minLength: { value: 2, message: "At least 2 characters" },
              })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Contact email */}
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="contact@acme.com"
              {...register("contactEmail", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Enter a valid email",
                },
              })}
            />
            {errors.contactEmail && (
              <p className="text-xs text-destructive">
                {errors.contactEmail.message}
              </p>
            )}
          </div>

          {/* Region */}
          <div className="space-y-1.5">
            <Label htmlFor="region">Region</Label>
            <select
              id="region"
              {...register("region", { required: true })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
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
              {mutation.isPending ? "Creating…" : "Create company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CompanyListPage() {
  const { data: companies, isLoading } = useCompanies();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* ── Title bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold">Companies</h1>
          {companies && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
              {companies.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-3.5 mr-1" />
          New company
        </Button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <DataTable
          variant="page"
          columns={companyColumns}
          data={companies}
          isLoading={isLoading}
          emptyMessage="No companies found."
          mobileRender={(company) => (
            <div className="px-4 py-3.5 border-b active:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="size-3.5 text-primary" />
                </div>
                <Link
                  to={`/admin/companies/${company.id}`}
                  className="text-sm font-medium hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {company.name}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-2">
                {company.contactEmail}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {company.region}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {company._count?.products ?? 0} products
                </span>
                <span className="text-xs text-muted-foreground">
                  {company._count?.users ?? 0} users
                </span>
              </div>
            </div>
          )}
        />
      </div>

      <NewCompanyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
