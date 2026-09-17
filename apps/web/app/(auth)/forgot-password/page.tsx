'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const [sent, setSent] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

    const mutation = useMutation({
        mutationFn: (values: FormValues) => apiClient.post('/auth/forgot-password', values),
        onSuccess: () => setSent(true),
    });

    if (sent) {
        return <p className="text-sm text-ink-grey max-w-sm">If that email exists, a reset link has been sent.</p>;
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="font-heading text-2xl text-ink mb-1">Reset your password</h1>
            <p className="text-sm text-ink-grey mb-6">We&apos;ll send you a reset link.</p>
            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
                <div>
                    <Input type="email" placeholder="Email" {...register('email')} />
                    <FieldError message={errors.email?.message} />
                </div>
                <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Sending...' : 'Send reset link'}
                </Button>
            </form>
        </div>
    );
}