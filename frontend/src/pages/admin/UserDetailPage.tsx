import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, Trash2 } from "lucide-react";
import { useUser, useRevokeProductAccess } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: user, isLoading } = useUser(id);
  const revokeMutation = useRevokeProductAccess(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Users
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{user.fullName}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{user.role.replace("_", " ")}</Badge>
          {!user.isActive && <Badge variant="destructive">inactive</Badge>}
        </div>
      </div>

      {user.company && (
        <p className="text-sm text-muted-foreground">
          Company: <span className="font-medium text-foreground">{user.company.name}</span>
        </p>
      )}
      {user.office && (
        <p className="text-sm text-muted-foreground">
          Office: <span className="font-medium text-foreground">{user.office}</span>
        </p>
      )}

      <Separator />

      {user.role === "engineer" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4" />
              Product access ({user.productAccess.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {user.productAccess.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products assigned.</p>
            ) : (
              user.productAccess.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.code}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => revokeMutation.mutate(p.id)}
                    disabled={revokeMutation.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
