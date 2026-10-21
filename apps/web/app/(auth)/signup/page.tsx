'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { signupSchema, SignupFormValues } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { toast } from '@/lib/toast';
import { decodeJwtPayload } from '@/lib/jwt';
import { getErrorMessage } from '@/lib/errors';
import type { RegistrationModeInfo } from '@/types/auth';
import { PasswordInput } from '@/components/ui/PasswordInput';

export default function SignupPage() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [serverError, setServerError] = useState<string | null>(null);

    const { data: modeInfo, isLoading: isModeLoading } = useQuery<RegistrationModeInfo>({
        queryKey: ['auth', 'registration-mode'],
        queryFn: () => apiClient.get('/auth/registration-mode').then((r) => r.data),
        staleTime: 60_000,
        retry: false, // if this fails we show the normal form; the server still enforces the mode on signup
    });
    const isClosed = modeInfo?.mode === 'invite_only';
    const allowedDomains = modeInfo?.mode === 'domain' ? modeInfo.allowedDomains : [];

    const { register, handleSubmit, control, formState: { errors } } = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: { role: 'APPLICANT' },
    });

    const role = useWatch({ control, name: 'role' });

    const mutation = useMutation({
        mutationFn: (values: SignupFormValues) => apiClient.post('/auth/signup', values),
        onSuccess: (res) => {
            const { accessToken, refreshToken, role } = res.data;
            const payload = decodeJwtPayload(accessToken);
            if (!payload) { setServerError('Login failed, please try again'); return; }
            setAuth(accessToken, role, payload.sub, refreshToken);
            if (role === 'APPLICANT') router.push('/applicant/dashboard');
            else router.push('/company/dashboard');
        },
        onError: (err: unknown) => {
            const msg = getErrorMessage(err, 'Something went wrong');
            setServerError(msg);
            toast.error(msg);
        },
    });

    if (isModeLoading) {
        return (
            <div className="w-full max-w-sm">
                <div className="h-8 w-48 rounded-lg bg-hairline-soft animate-pulse mb-3" />
                <div className="h-4 w-64 rounded-lg bg-hairline-soft animate-pulse mb-8" />
                <div className="h-40 rounded-xl bg-hairline-soft animate-pulse" />
            </div>
        );
    }

    if (isClosed) {
        return (
            <Stagger className="w-full max-w-sm">
                <StaggerItem>
                    <h1 className="font-heading text-2xl text-ink mb-1">Registration is closed</h1>
                    <p className="text-sm text-ink-grey mb-6">
                        New accounts are created by your administrator. If you were invited, check your email for the link to set your password, then log in.
                    </p>
                </StaggerItem>
                <StaggerItem>
                    <Link href="/login" className="text-sm text-ink font-medium underline underline-offset-2">
                        Go to log in
                    </Link>
                </StaggerItem>
            </Stagger>
        );
    }

    return (
        <Stagger className="w-full max-w-sm">
            <StaggerItem>
                <h1 className="font-heading text-2xl text-ink mb-1">Create an account</h1>
                <p className="text-sm text-ink-grey mb-8">Get started in a minute.</p>
            </StaggerItem>

            {allowedDomains.length > 0 && (
                <StaggerItem>
                    <div className="bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 mb-6">
                        <p className="text-sm text-ink">Sign up with an email from one of these domains:</p>
                        <p className="text-sm font-medium text-ink mt-1">{allowedDomains.join(', ')}</p>
                    </div>
                </StaggerItem>
            )}

            <form onSubmit={handleSubmit((v) => { setServerError(null); mutation.mutate(v); })} className="flex flex-col gap-4">
                <StaggerItem>
                    <div className="flex gap-2 p-1 bg-hairline-soft rounded-lg">
                        <label
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-body text-center cursor-pointer transition-colors ${role === 'APPLICANT' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-grey'
                                }`}
                        >
                            <input type="radio" value="APPLICANT" {...register('role')} className="hidden" />
                            Applicant
                        </label>
                        <label
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-body text-center cursor-pointer transition-colors ${role === 'COMPANY' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-grey'
                                }`}
                        >
                            <input type="radio" value="COMPANY" {...register('role')} className="hidden" />
                            Company
                        </label>
                    </div>
                </StaggerItem>

                <StaggerItem>
                    <Input type="email" placeholder="Email" {...register('email')} />
                    <FieldError message={errors.email?.message} />
                </StaggerItem>
                <StaggerItem>
                    <PasswordInput placeholder="Password" autoComplete="new-password" {...register('password')} />
                    <FieldError message={errors.password?.message} />
                </StaggerItem>

                {serverError && (
                    <StaggerItem>
                        <p className="text-sm text-danger">{serverError}</p>
                    </StaggerItem>
                )}

                <StaggerItem>
                    <Button type="submit" disabled={mutation.isPending} className="w-full">
                        {mutation.isPending ? 'Creating account...' : 'Sign up'}
                    </Button>
                </StaggerItem>
            </form>

            <StaggerItem>
                <p className="text-sm text-ink-grey mt-6">
                    Already have an account?{' '}
                    <Link href="/login" className="text-ink font-medium underline underline-offset-2">Log in</Link>
                </p>
            </StaggerItem>
        </Stagger>
    );
}