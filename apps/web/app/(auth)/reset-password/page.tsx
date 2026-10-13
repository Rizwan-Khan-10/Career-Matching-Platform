'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/lib/toast';

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
        onError: (err: any) => {
            const m = err?.response?.data?.message;
            setError((Array.isArray(m) ? m[0] : m) || 'Could not reset the password');
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
            <Input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={mutation.isPending} className="w-full">
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