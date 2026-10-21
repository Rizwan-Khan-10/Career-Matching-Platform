'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { useFinishLogin } from '@/lib/hooks/useFinishLogin';
import type { TokenResponse } from '@/types/auth';

function VerifyForm() {
    const token = useSearchParams().get('token') ?? '';
    const finishLogin = useFinishLogin();
    const [error, setError] = useState<string | null>(null);

    // a button, not an automatic call: some mail scanners open every link and would use up the one-time token
    const mutation = useMutation({
        mutationFn: () => apiClient.post<TokenResponse>('/auth/verify-email', { token }).then((r) => r.data),
        onSuccess: (tokens) => {
            if (finishLogin(tokens)) toast.success('Email confirmed, welcome!');
            else setError('Your email is confirmed. Please log in.');
        },
        onError: (err: unknown) => setError(getErrorMessage(err, 'Could not confirm your email')),
    });

    if (!token) {
        return (
            <p className="text-sm text-danger">
                This confirmation link is invalid. Log in to get a new one.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4 w-full max-w-sm">
            <h1 className="font-heading text-2xl text-ink">Confirm your email</h1>
            <p className="text-sm text-ink-grey">One click and your account is ready.</p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="button" className="w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Confirming…' : 'Confirm my email'}
            </Button>
            <Link href="/login" className="text-sm text-ink-grey underline underline-offset-2">
                Go to log in
            </Link>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <VerifyForm />
        </Suspense>
    );
}