import { Plus, Package } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ProductListPage() {
  const { data: products, isLoading } = useProducts();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">{products?.length ?? "…"} products</p>
        </div>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          New product
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {products?.map((product) => (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{product.code}</span> · {product.company.name}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{product.owningOffice}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {product._count?.issues ?? 0} issues
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
