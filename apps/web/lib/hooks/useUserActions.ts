'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/** Activate / deactivate / delete a user (contract 5.1). `listKey` is the list that has to be refetched afterwards. */
export function useUserActions(listKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });

  const setActive = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      apiClient.patch(`/auth/admin/users/${userId}/active`, { active }).then((r) => r.data),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/auth/admin/users/${userId}`).then((r) => r.data),
    onSuccess: refresh,
  });

  return { setActive, remove };
}