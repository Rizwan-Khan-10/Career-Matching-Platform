'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { signupSchema, SignupFormValues } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';

export default function SignupPage() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [serverError, setServerError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: { role: 'APPLICANT' },
    });

    const mutation = useMutation({
        mutationFn: (values: SignupFormValues) => apiClient.post('/auth/signup', values),
        onSuccess: (res) => {
            const { accessToken, role } = res.data;
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            setAuth(accessToken, role, payload.sub);
            if (role === 'APPLICANT') router.push('/applicant/dashboard');
            else router.push('/company/dashboard');
        },
        onError: (err: any) => {
            setServerError(err.response?.data?.message || 'Signup failed');
        },
    });

    return (
        <div className="w-full max-w-sm">
            <h1 className="font-heading text-2xl text-ink mb-1">Create an account</h1>
            <p className="text-sm text-ink-grey mb-6">Get started in a minute.</p>

            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
                <div className="flex gap-2">
                    <label className="flex-1 border border-hairline rounded px-3 py-2.5 text-sm font-body text-center cursor-pointer has-[:checked]:bg-accent has-[:checked]:text-white transition-colors">
                        <input type="radio" value="APPLICANT" {...register('role')} className="hidden" />
                        Applicant
                    </label>
                    <label className="flex-1 border border-hairline rounded px-3 py-2.5 text-sm font-body text-center cursor-pointer has-[:checked]:bg-accent has-[:checked]:text-white transition-colors">
                        <input type="radio" value="COMPANY" {...register('role')} className="hidden" />
                        Company
                    </label>
                </div>

                <div>
                    <Input type="email" placeholder="Email" {...register('email')} />
                    <FieldError message={errors.email?.message} />
                </div>
                <div>
                    <Input type="password" placeholder="Password" {...register('password')} />
                    <FieldError message={errors.password?.message} />
                </div>

                {serverError && <p className="text-sm text-danger">{serverError}</p>}

                <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Creating account...' : 'Sign up'}
                </Button>
            </form>

            <p className="text-sm text-ink-grey mt-4">
                Already have an account?{' '}
                <Link href="/login" className="text-ink font-medium underline">Log in</Link>
            </p>
        </div>
    );
}