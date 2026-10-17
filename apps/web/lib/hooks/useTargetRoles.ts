'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { normalizeTargetRoles } from '@/lib/targetRoles';
import type { TargetRoles } from '@/types/targetRoles';

// the company role form (task 4.5) reuses this hook
export function useTargetRoles() {
  return useQuery<TargetRoles>({
    queryKey: ['target-roles'],
    queryFn: () => apiClient.get('/resumes/target-roles').then((r) => normalizeTargetRoles(r.data)),
    staleTime: 10 * 60_000,
  });
}