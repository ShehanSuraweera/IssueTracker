import { Link } from "react-router-dom";
import { Plus, Building2 } from "lucide-react";
import { useCompanies } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function CompanyListPage() {
  const { data: companies, isLoading } = useCompanies();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Companies</h1>
          <p className="text-sm text-muted-foreground">{companies?.length ?? "…"} clients</p>
        </div>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          New company
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {companies?.map((company) => (
            <Card key={company.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/admin/companies/${company.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {company.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{company.contactEmail}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{company.region}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {company._count?.products ?? 0} products · {company._count?.users ?? 0} users
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
