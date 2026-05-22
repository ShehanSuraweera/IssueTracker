import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, UserCircle2, Clock } from "lucide-react";
import { useUsers } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/role-badge";

type Filter = "all" | "pending";

export default function UserListPage() {
  const { data: users, isLoading } = useUsers();
  const [filter, setFilter] = useState<Filter>("all");

  const pendingCount = users?.filter((u) => !u.isActive).length ?? 0;
  const visible = filter === "pending"
    ? users?.filter((u) => !u.isActive)
    : users;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">{users?.length ?? "…"} members</p>
        </div>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          New user
        </Button>
      </div>

      {/* filter tabs */}
      <div className="flex items-center gap-1 border-b pb-0">
        {(["all", "pending"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === f
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "pending" && <Clock className="size-3.5" />}
            {f === "all" ? "All users" : "Pending approval"}
            {f === "pending" && pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : visible?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {filter === "pending" ? "No pending approval requests." : "No users found."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible?.map((user) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserCircle2 className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/admin/users/${user.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {user.fullName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={user.role} />
                  {!user.isActive && (
                    <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">
                      pending approval
                    </Badge>
                  )}
                  {user.company && (
                    <span className="text-xs text-muted-foreground">{user.company.name}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
