'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { toast } from '@/lib/toast';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const [sent, setSent] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

    const mutation = useMutation({
        mutationFn: (values: FormValues) => apiClient.post('/auth/forgot-password', values),
        onSuccess: () => {
            setSent(true);
            toast.success('Reset link sent (check terminal logs for now)');
        },
        onError: (err: any) => {
            const msg = err.response?.data?.message || 'Something went wrong';
            toast.error(msg);
        },
    });

    return (
        <div className="w-full max-w-sm">
            <AnimatePresence mode="wait">
                {sent ? (
                    <motion.div
                        key="sent"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        <h1 className="font-heading text-2xl text-ink mb-2">Check your email</h1>
                        <p className="text-sm text-ink-grey leading-relaxed">
                            If that email exists, we&apos;ve sent a link to reset your password.
                        </p>
                    </motion.div>
                ) : (
                    <Stagger key="form">
                        <StaggerItem>
                            <h1 className="font-heading text-2xl text-ink mb-1">Reset your password</h1>
                            <p className="text-sm text-ink-grey mb-8">We&apos;ll send you a reset link.</p>
                        </StaggerItem>
                        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
                            <StaggerItem>
                                <Input type="email" placeholder="Email" {...register('email')} />
                                <FieldError message={errors.email?.message} />
                            </StaggerItem>
                            <StaggerItem>
                                <Button type="submit" disabled={mutation.isPending} className="w-full">
                                    {mutation.isPending ? 'Sending...' : 'Send reset link'}
                                </Button>
                            </StaggerItem>
                        </form>
                    </Stagger>
                )}
            </AnimatePresence>
        </div>
    );
}