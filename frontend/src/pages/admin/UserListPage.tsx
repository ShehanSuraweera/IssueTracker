import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Clock } from "lucide-react";
import { useForm } from "react-hook-form";
import { useUsers, useCreateUser } from "@/hooks/use-users";
import { useCompanies } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleBadge } from "@/components/ui/role-badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import type { CreateUserInput, UserRole, Office, User } from "@/types/users";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const userColumns: ColumnDef<User>[] = [
  {
    key: "fullName",
    header: "User",
    render: (row) => (
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
          {initials(row.fullName)}
        </div>
        <Link
          to={`/admin/users/${row.id}`}
          className="text-sm font-medium hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {row.fullName}
        </Link>
      </div>
    ),
  },
  {
    key: "email",
    header: "Email",
    render: (row) => <span className="text-xs text-muted-foreground">{row.email}</span>,
  },
  {
    key: "role",
    header: "Role",
    render: (row) => <RoleBadge role={row.role} />,
  },
  {
    key: "company",
    header: "Company",
    render: (row) => <span className="text-xs text-muted-foreground">{row.company?.name ?? <span className="opacity-40">—</span>}</span>,
  },
  {
    key: "office",
    header: "Office",
    render: (row) => <span className="text-xs text-muted-foreground">{row.office ?? <span className="opacity-40">—</span>}</span>,
  },
  {
    key: "isActive",
    header: "Status",
    render: (row) => row.isActive
      ? <Badge variant="secondary" className="text-xs">Active</Badge>
      : <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">Pending</Badge>,
  },
];

type Filter = "all" | "pending";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "client_user", label: "Client user" },
  { value: "engineer",    label: "Engineer"    },
  { value: "admin",       label: "Admin"       },
];

const OFFICES: { value: Office; label: string }[] = [
  { value: "KR", label: "Korea (KR)"     },
  { value: "LK", label: "Sri Lanka (LK)" },
  { value: "IN", label: "India (IN)"     },
];

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutation                 = useCreateUser();
  const { data: companies = [] } = useCompanies();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CreateUserInput>({
    defaultValues: { role: "client_user" },
  });

  const role = watch("role");

  const onSubmit = (values: CreateUserInput) => {
    mutation.mutate(values, {
      onSuccess: () => { reset(); onClose(); },
    });
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New User</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">

          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              placeholder="Jane Smith"
              {...register("fullName", { required: "Full name is required", minLength: { value: 2, message: "At least 2 characters" } })}
            />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="jane@example.com"
              {...register("email", {
                required: "Email is required",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
              })}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              {...register("password", { required: "Password is required", minLength: { value: 8, message: "At least 8 characters" } })}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              {...register("role", { required: true })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {role === "client_user" && (
            <div className="space-y-1.5">
              <Label htmlFor="companyId">Company</Label>
              <select
                id="companyId"
                {...register("companyId")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {role === "engineer" && (
            <div className="space-y-1.5">
              <Label htmlFor="office">Office</Label>
              <select
                id="office"
                {...register("office")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select an office…</option>
                {OFFICES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {mutation.isError && (
            <p className="text-xs text-destructive">Something went wrong. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UserListPage() {
  const { data: users, isLoading } = useUsers();
  const [filter, setFilter]        = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const pendingCount = users?.filter((u) => !u.isActive).length ?? 0;
  const visible      = filter === "pending" ? users?.filter((u) => !u.isActive) : users;

  return (
    <div className="flex flex-col h-full">

      {/* ── Title bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold">Users</h1>
          {users && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
              {users.length}
            </span>
          )}
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="size-3.5 mr-1" />
          New user
        </Button>
      </div>

      {/* ── Filter tabs ──────────────────────────────────────────────── */}
      <div className="flex border-b shrink-0 bg-background">
        {(["all", "pending"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex items-center gap-1.5 px-5 py-3 text-xs font-medium whitespace-nowrap transition-colors",
              filter === f
                ? "border-b-2 text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground",
            )}
            style={filter === f ? { borderBottomColor: "var(--brand-green)" } : undefined}
          >
            {f === "pending" && <Clock className="size-3" />}
            {f === "all" ? "All users" : "Pending approval"}
            {f === "pending" && pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <DataTable
          variant="page"
          columns={userColumns}
          data={visible}
          isLoading={isLoading}
          emptyMessage={filter === "pending" ? "No pending approval requests." : "No users found."}
        />
      </div>

      <NewUserDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
