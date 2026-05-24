import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listProducts, createProduct } from "@/api/products";
import { queryKeys } from "./query-keys";
import { getApiError } from "@/lib/utils";

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
    onSuccess: () => {
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
    },
    onError: (err) => toast.error(getApiError(err, "Failed to create product")),
  });
}
