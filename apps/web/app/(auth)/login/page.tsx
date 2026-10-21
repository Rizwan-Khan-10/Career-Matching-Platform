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
import { PasswordInput } from '@/components/ui/PasswordInput';
import { FieldError } from '@/components/ui/FieldError';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { toast } from '@/lib/toast';
import { decodeJwtPayload } from '@/lib/jwt';
import { getErrorMessage } from '@/lib/errors';
import { suggestEmailFix } from '@/lib/emailTypo';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailBlurred, setEmailBlurred] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const emailField = register('email');
  const emailValue = watch('email') ?? '';
  // shown only after the user leaves the field, so it does not flash while they are still typing
  const emailFix = emailBlurred ? suggestEmailFix(emailValue) : null;

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => apiClient.post('/auth/login', values),
    onSuccess: (res) => {
      const { accessToken, refreshToken, role } = res.data;
      const payload = decodeJwtPayload(accessToken);
      if (!payload) { setServerError('Login failed, please try again'); return; }
      setAuth(accessToken, role, payload.sub, refreshToken);
      setServerError(null);
      if (role === 'APPLICANT') router.push('/applicant/dashboard');
      else if (role === 'COMPANY') router.push('/company/dashboard');
      else router.push('/admin/dashboard');
    },
    onError: (err: unknown, values) => {
      const raw = getErrorMessage(err, 'Something went wrong');
      // Same server message for "no such email" and "wrong password" (on purpose). Showing the typed
      // email lets the user spot a typo without the server leaking which emails have accounts.
      const msg = raw === 'Invalid credentials'
        ? `We couldn't sign you in as ${values.email}. Check the email and password.`
        : raw;
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
          <Input
            type="email"
            placeholder="Email"
            autoComplete="email"
            {...emailField}
            onBlur={(e) => { emailField.onBlur(e); setEmailBlurred(true); }}
          />
          <FieldError message={errors.email?.message} />
          {emailFix && (
            <p className="text-xs text-ink-grey mt-1">
              Did you mean{' '}
              <button
                type="button"
                className="text-ink font-medium underline underline-offset-2"
                onClick={() => setValue('email', emailFix, { shouldValidate: true })}
              >
                {emailFix}
              </button>
              ?
            </p>
          )}
        </StaggerItem>
        <StaggerItem>
          <PasswordInput placeholder="Password" autoComplete="current-password" {...register('password')} />
          <FieldError message={errors.password?.message} />
        </StaggerItem>

        {serverError && (
          <StaggerItem>
            <p className="text-sm text-danger">{serverError}</p>
            {serverError === 'Account disabled' && (
              <p className="text-xs text-ink-grey mt-1">
                Your account has been deactivated. Please contact your administrator.
              </p>
            )}
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