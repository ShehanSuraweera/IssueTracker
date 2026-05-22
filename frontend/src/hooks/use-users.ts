import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  listEngineers,
  getUser,
  updateUser,
  revokeProductAccess,
  changePassword,
} from "@/api/users";
import { queryKeys } from "./query-keys";
import type { ChangePasswordInput, UpdateUserInput } from "@/types/users";

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.all(),
    queryFn: listUsers,
  });
}

export function useEngineers() {
  return useQuery({
    queryKey: queryKeys.users.engineers(),
    queryFn:  listEngineers,
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(userId) }),
  });
}

export function useUpdateUser(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(userId!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
  });
}
