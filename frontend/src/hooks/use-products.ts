import { useQuery } from "@tanstack/react-query";
import { listProducts } from "@/api/products";
import { queryKeys } from "./query-keys";

export function useProducts() {
  return useQuery({
    queryKey: queryKeys.products.all(),
    queryFn:  listProducts,
  });
}
