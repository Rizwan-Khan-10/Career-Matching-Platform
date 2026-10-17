'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export const PENDING_JOBS_KEY = ['adminPendingJobs'] as const;

// contract 5.5: PATCH /jobs/admin/:id/approval { approved, note? }. Approving publishes jd.uploaded on the server.
export function useJobApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved, note }: { id: string; approved: boolean; note?: string }) =>
      apiClient.patch(`/jobs/admin/${id}/approval`, { approved, ...(note ? { note } : {}) }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_JOBS_KEY }),
  });
}