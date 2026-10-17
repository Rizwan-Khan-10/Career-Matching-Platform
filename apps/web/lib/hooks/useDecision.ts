'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { DecisionBody } from '@/lib/decisions';

// PATCH /matches/:id/decision (contract 5.6). Callers use mutateAsync and show the server message themselves.
export function useDecision(roleId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: DecisionBody }) =>
            apiClient.patch(`/matches/${id}/decision`, body).then((r) => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roleApplicants', roleId] });
            queryClient.invalidateQueries({ queryKey: ['companyStats'] });
        },
    });
}