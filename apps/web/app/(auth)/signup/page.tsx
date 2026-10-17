'use client';

import { useForm } from 'react-hook-form';
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

interface RegistrationModeResponse {
    mode: 'open' | 'invite_only' | 'domain';
    allowedDomains: string[];
}

export default function SignupPage() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [serverError, setServerError] = useState<string | null>(null);

    // Contract 5.1: GET /auth/registration-mode is public and decides whether/how signup is allowed.
    // If the call fails (endpoint not reachable yet) we fall back to "open" — the server is the real
    // gate anyway (POST /auth/signup enforces it), this is only to adapt the UI.
    const { data: registrationMode } = useQuery({
        queryKey: ['registrationMode'],
        queryFn: () => apiClient.get<RegistrationModeResponse>('/auth/registration-mode').then((r) => r.data),
        staleTime: 60_000,
        retry: false,
    });
    const mode = registrationMode?.mode ?? 'open';
    const allowedDomains = registrationMode?.allowedDomains ?? [];

    const { register, handleSubmit, watch, formState: { errors } } = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: { role: 'APPLICANT' },
    });

    const role = watch('role');

    const mutation = useMutation({
        mutationFn: (values: SignupFormValues) => apiClient.post('/auth/signup', values),
        onSuccess: (res) => {
            const { accessToken, refreshToken, role } = res.data;
            const payload = decodeJwtPayload(accessToken);
            if (!payload) { setServerError('Login failed, please try again'); return; }
            setAuth(accessToken, role, String(payload.sub), refreshToken);
            if (role === 'APPLICANT') router.push('/applicant/dashboard');
            else router.push('/company/dashboard');
        },
        onError: (err: any) => {
            const msg = err.response?.data?.message || 'Something went wrong';
            setServerError(msg);
            toast.error(msg);
        },
    });

    if (mode === 'invite_only') {
        return (
            <Stagger className="w-full max-w-sm">
                <StaggerItem>
                    <h1 className="font-heading text-2xl text-ink mb-1">Registration is closed</h1>
                    <p className="text-sm text-ink-grey mb-6">
                        This platform is invite-only right now. Your institution admin adds accounts directly —
                        if you were expecting access, ask them to add you.
                    </p>
                </StaggerItem>
                <StaggerItem>
                    <Link href="/login" className="text-sm text-ink font-medium underline underline-offset-2">
                        Back to login
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

            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
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
                    {mode === 'domain' && allowedDomains.length > 0 && (
                        <p className="text-xs text-ink-grey mt-1">
                            Only emails from {allowedDomains.join(', ')} can sign up.
                        </p>
                    )}
                </StaggerItem>
                <StaggerItem>
                    <Input type="password" placeholder="Password" {...register('password')} />
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