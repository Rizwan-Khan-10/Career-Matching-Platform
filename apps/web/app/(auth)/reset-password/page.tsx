'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';

function ResetForm() {
    const router = useRouter();
    const token = useSearchParams().get('token') ?? '';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: () => apiClient.post('/auth/reset-password', { resetToken: token, newPassword: password }),
        onSuccess: () => {
            toast.success('Password updated, please log in');
            router.push('/login');
        },
        onError: (err) => {
            setError(getErrorMessage(err, 'Could not reset the password'));
        },
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) return setError('Password must be at least 8 characters');
        if (password !== confirm) return setError('Passwords do not match');
        setError(null);
        mutation.mutate();
    };

    if (!token) return <p className="text-sm text-danger">This reset link is invalid. Request a new one from the login page.</p>;

    return (
        <form onSubmit={submit} className="flex flex-col gap-4 w-full max-w-sm">
            <h1 className="font-heading text-2xl text-ink">Choose a new password</h1>
            <div>
                <Field id="reset-new" label="New password">
                    <PasswordInput
                        id="reset-new"
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </Field>
                <PasswordStrength password={password} />
            </div>
            <Field id="reset-confirm" label="Confirm password" error={confirm && password !== confirm ? 'Passwords do not match' : undefined}>
                <PasswordInput
                    id="reset-confirm"
                    placeholder="Type it again"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                />
            </Field>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={mutation.isPending} className="w-full inline-flex items-center justify-center gap-2 min-h-10">
                {mutation.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                {mutation.isPending ? 'Saving...' : 'Update password'}
            </Button>
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetForm />
        </Suspense>
    );
}
