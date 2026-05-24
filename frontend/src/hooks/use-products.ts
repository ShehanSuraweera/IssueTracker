import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProducts, createProduct } from "@/api/products";
import { queryKeys } from "./query-keys";

export function useProducts() {
  return useQuery({
    queryKey: queryKeys.products.all(),
    queryFn: listProducts,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.products.all() }),
  });
}
