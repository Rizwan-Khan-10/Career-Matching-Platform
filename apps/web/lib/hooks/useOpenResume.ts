import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';

/** Opens the signed PDF link of GET /resumes/:id/pdf in a new tab (same flow as the company applicants page). */
export function useOpenResume() {
    const mutation = useMutation({
        mutationFn: async ({ resumeId }: { resumeId: string; popup: Window | null }) =>
            (await apiClient.get(`/resumes/${resumeId}/pdf`)).data as { url: string; fileName: string },
        onSuccess: (data, { popup }) => {
            if (popup) { popup.opener = null; popup.location.href = data.url; }
            else window.location.assign(data.url);
        },
        onError: (err: unknown, { popup }) => {
            popup?.close();
            toast.error(getErrorMessage(err, 'Could not open the resume, try again'));
        },
    });
    return {
        pending: mutation.isPending,
        open: (resumeId: string) => mutation.mutate({ resumeId, popup: window.open('about:blank', '_blank') }),
    };
}
