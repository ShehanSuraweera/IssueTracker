import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useCompanies, useCreateCompany } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { CreateCompanyInput, Region } from "@/types/companies";

const REGIONS: { value: Region; label: string }[] = [
  { value: "KR",     label: "Korea (KR)"     },
  { value: "LK",     label: "Sri Lanka (LK)" },
  { value: "IN",     label: "India (IN)"     },
  { value: "GLOBAL", label: "Global"         },
];

function NewCompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutation = useCreateCompany();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateCompanyInput>({
    defaultValues: { region: "GLOBAL" },
  });

  const onSubmit = (values: CreateCompanyInput) => {
    mutation.mutate(values, {
      onSuccess: () => { reset(); onClose(); },
    });
  };

  const handleClose = () => { reset(); onClose(); };

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
              {...register("name", { required: "Name is required", minLength: { value: 2, message: "At least 2 characters" } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
              })}
            />
            {errors.contactEmail && <p className="text-xs text-destructive">{errors.contactEmail.message}</p>}
          </div>

          {/* Region */}
          <div className="space-y-1.5">
            <Label htmlFor="region">Region</Label>
            <select
              id="region"
              {...register("region", { required: true })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">Something went wrong. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={mutation.isPending}>
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
        <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="size-3.5 mr-1" />
          New company
        </Button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
              <tr className="border-b">
                {["Company", "Contact", "Region", "Products", "Users"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                    No companies found.
                  </td>
                </tr>
              )}
              {companies?.map((company) => (
                <tr
                  key={company.id}
                  className="border-b cursor-pointer hover:bg-muted/40 transition-colors group"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Building2 className="size-3.5 text-primary" />
                      </div>
                      <Link
                        to={`/admin/companies/${company.id}`}
                        className="text-sm font-medium group-hover:text-primary transition-colors"
                      >
                        {company.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {company.contactEmail}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary" className="text-xs">
                      {company.region}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {company._count?.products ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {company._count?.users ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewCompanyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
