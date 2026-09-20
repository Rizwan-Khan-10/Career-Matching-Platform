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
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { toast } from '@/lib/toast';

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
      const msg = err.response?.data?.message || 'Something went wrong';
      setServerError(msg);
      toast.error(msg);
    },
  });

  return (
    <Stagger className="w-full max-w-sm">
      <StaggerItem>
        <h1 className="font-heading text-2xl text-ink mb-1">Welcome back</h1>
        <p className="text-sm text-ink-grey mb-8">Log in to continue.</p>
      </StaggerItem>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
        <StaggerItem>
          <Input type="email" placeholder="Email" {...register('email')} />
          <FieldError message={errors.email?.message} />
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
            {mutation.isPending ? 'Logging in...' : 'Log in'}
          </Button>
        </StaggerItem>
      </form>

      <StaggerItem>
        <p className="text-sm text-ink-grey mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-ink font-medium underline underline-offset-2">Sign up</Link>
        </p>
        <Link href="/forgot-password" className="text-sm text-ink-grey underline underline-offset-2 mt-2 inline-block">
          Forgot password?
        </Link>
      </StaggerItem>
    </Stagger>
  );
}