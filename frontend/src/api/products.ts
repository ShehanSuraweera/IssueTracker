import { api } from "./client";
import type { Product, CreateProductInput, UpdateProductInput } from "@/types/products";

export async function listProducts(): Promise<Product[]> {
  const { data } = await api.get<{ data: Product[] }>("/products");
  return data.data;
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await api.get<{ data: Product }>(`/products/${id}`);
  return data.data;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data } = await api.post<{ data: Product }>("/products", input);
  return data.data;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const { data } = await api.patch<{ data: Product }>(`/products/${id}`, input);
  return data.data;
}
