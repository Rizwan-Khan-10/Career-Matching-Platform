'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { loginSchema, LoginFormValues } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => apiClient.post('/auth/login', values),
    onSuccess: (res) => {
      const { accessToken, role } = res.data;
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      setAuth(accessToken, role, payload.sub);
      setServerError(null);
      if (role === 'APPLICANT') router.push('/applicant/dashboard');
      else if (role === 'COMPANY') router.push('/company/dashboard');
      else router.push('/admin/dashboard');
    },
    onError: (err: any) => {
      setServerError(err.response?.data?.message || 'Login failed');
    },
  });

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-heading text-2xl text-ink mb-1">Welcome back</h1>
      <p className="text-sm text-ink-grey mb-6">Log in to continue.</p>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
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
          {mutation.isPending ? 'Logging in...' : 'Log in'}
        </Button>
      </form>

      <p className="text-sm text-ink-grey mt-4">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-ink font-medium underline">Sign up</Link>
      </p>
      <Link href="/forgot-password" className="text-sm text-ink-grey underline mt-2 inline-block">
        Forgot password?
      </Link>
    </div>
  );
}