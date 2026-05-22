import { Link } from "react-router-dom";
import { Plus, UserCircle2 } from "lucide-react";
import { useUsers } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/role-badge";

export default function UserListPage() {
  const { data: users, isLoading } = useUsers();

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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {users?.map((user) => (
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
                    <Badge variant="destructive" className="text-xs">inactive</Badge>
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
