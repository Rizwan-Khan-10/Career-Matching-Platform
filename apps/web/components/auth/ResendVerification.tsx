'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';

export function ResendVerification({ email, startCooldown = 0 }: { email: string; startCooldown?: number }) {
    const [cooldown, setCooldown] = useState(startCooldown);

    useEffect(() => {
        if (cooldown <= 0) return;
        const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(id);
    }, [cooldown]);

    const resend = useMutation({
        mutationFn: () => apiClient.post('/auth/resend-verification', { email }),
        onSuccess: () => {
            toast.success('If that email is waiting for verification, a new link is on its way');
            setCooldown(60);
        },
        onError: (err: unknown) => toast.error(getErrorMessage(err, 'Could not send the email, try again later')),
    });

    return (
        <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending || cooldown > 0}
            className="text-sm text-ink font-medium underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
        >
            {cooldown > 0 ? `Send the email again (${cooldown}s)` : resend.isPending ? 'Sending…' : 'Send the email again'}
        </button>
    );
}