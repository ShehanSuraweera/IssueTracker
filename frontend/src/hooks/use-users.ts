import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listUsers,
  listEngineers,
  getUser,
  createUser,
  updateUser,
  revokeProductAccess,
  changePassword,
} from "@/api/users";
import { queryKeys } from "./query-keys";
import { getApiError } from "@/lib/utils";
import type {
  ChangePasswordInput,
  CreateUserInput,
  UpdateUserInput,
} from "@/types/users";

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.all(),
    queryFn: listUsers,
  });
}

export function useEngineers() {
  return useQuery({
    queryKey: queryKeys.users.engineers(),
    queryFn: listEngineers,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => getUser(id!),
    enabled: !!id,
  });
}

export function useRevokeProductAccess(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => revokeProductAccess(userId!, productId),
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
    },
    onError: (err) => toast.error(getApiError(err, "Failed to revoke access")),
  });
}

export function useUpdateUser(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(userId!, input),
    onSuccess: () => {
      toast.success("Changes saved");
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
    onError: (err) => toast.error(getApiError(err, "Failed to save changes")),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
    onError: (err) => toast.error(getApiError(err, "Failed to create user")),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
    onSuccess: () => toast.success("Password updated"),
    onError: (err) => toast.error(getApiError(err, "Failed to update password")),
  });
}
