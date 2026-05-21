import { api } from "./client";
import type {
  User,
  UserDetail,
  CreateUserInput,
  UpdateUserInput,
  ChangePasswordInput,
} from "@/types/users";

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<{ data: User[] }>("/users");
  return data.data;
}

export async function getUser(id: string): Promise<UserDetail> {
  const { data } = await api.get<{ data: UserDetail }>(`/users/${id}`);
  return data.data;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { data } = await api.post<{ data: User }>("/users", input);
  return data.data;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const { data } = await api.patch<{ data: User }>(`/users/${id}`, input);
  return data.data;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.patch("/users/me/password", input);
}

export async function grantProductAccess(userId: string, productId: string) {
  const { data } = await api.post(`/users/${userId}/products`, { productId });
  return data.data;
}

export async function revokeProductAccess(userId: string, productId: string): Promise<void> {
  await api.delete(`/users/${userId}/products/${productId}`);
}
