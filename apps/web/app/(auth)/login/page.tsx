'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { loginSchema, LoginFormValues } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Loader2 } from 'lucide-react';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { TwoFactorStep } from '@/components/auth/TwoFactorStep';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { toast } from '@/lib/toast';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { suggestEmailFix } from '@/lib/emailTypo';
import { useFinishLogin } from '@/lib/hooks/useFinishLogin';
import { useRegistrationMode } from '@/lib/hooks/useRegistrationMode';
import { isTwoFactorChallenge, isTwoFactorSetupRequired, LoginResponse } from '@/types/auth';
import { AdminTwoFactorSetup } from '@/components/auth/AdminTwoFactorSetup';
import { ResendVerification } from '@/components/auth/ResendVerification';

export default function LoginPage() {
  const router = useRouter();
  const finishLogin = useFinishLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // null in college mode: the Google button is then not rendered at all
  const { data: modeInfo } = useRegistrationMode();
  const googleClientId = modeInfo?.googleEnabled ? modeInfo.googleClientId : null;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const emailField = register('email');
  const emailValue = watch('email') ?? '';
  // shown only after the user leaves the field, so it does not flash while they are still typing
  const emailFix = emailBlurred ? suggestEmailFix(emailValue) : null;

  // password login and Google login answer the same way: tokens, or a 2FA challenge
  const handleLoginResponse = (data: LoginResponse) => {
    setServerError(null);
    if (isTwoFactorChallenge(data)) {
      setChallengeId(data.challengeId); // second step: no tokens yet
      return;
    }
    if (isTwoFactorSetupRequired(data)) {
      setSetupToken(data.setupToken); // an admin who must set up two-factor first
      return;
    }
    if (!finishLogin(data)) setServerError('Login failed, please try again');
  };

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => apiClient.post<LoginResponse>('/auth/login', values),
    onSuccess: (res) => handleLoginResponse(res.data),
    onError: (err: unknown, values) => {
      if (getErrorCode(err) === 'EMAIL_NOT_VERIFIED') {
        // password was right, the address was never confirmed: offer to send the link again
        setUnverifiedEmail(values.email);
        setServerError(getErrorMessage(err, 'Please verify your email first.'));
        return;
      }
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

  const googleMutation = useMutation({
    mutationFn: (credential: string) =>
      apiClient.post<LoginResponse>('/auth/google', { credential }).then((r) => r.data),
    onSuccess: handleLoginResponse,
    onError: (err: unknown) => {
      if (getErrorCode(err) === 'ROLE_REQUIRED') {
        // first time with this Google account: the server needs to know Applicant or Company
        toast.info('No account for this Google email yet. Choose Applicant or Company, then continue with Google.');
        router.push('/signup');
        return;
      }
      const msg = getErrorMessage(err, 'Google sign-in failed, please try again');
      setServerError(msg);
      toast.error(msg);
    },
  });

  if (challengeId) {
    return (
      <Stagger className="w-full max-w-sm">
        <StaggerItem>
          <h1 className="font-heading text-2xl text-ink mb-1">Two-step verification</h1>
          <p className="text-sm text-ink-grey mb-8">One more step to finish logging in.</p>
        </StaggerItem>
        <StaggerItem>
          <TwoFactorStep
            challengeId={challengeId}
            onSuccess={(tokens) => {
              if (!finishLogin(tokens)) {
                setChallengeId(null);
                setServerError('Login failed, please try again');
              }
            }}
            onBack={(message) => {
              setChallengeId(null);
              setServerError(message ?? null);
            }}
          />
        </StaggerItem>
      </Stagger>
    );
  }

  if (setupToken) {
    return (
      <Stagger className="w-full max-w-sm">
        <StaggerItem>
          <h1 className="font-heading text-2xl text-ink mb-1">Set up two-factor</h1>
          <p className="text-sm text-ink-grey mb-8">Required for admin accounts.</p>
        </StaggerItem>
        <StaggerItem>
          <AdminTwoFactorSetup
            setupToken={setupToken}
            onSuccess={(tokens) => {
              if (!finishLogin(tokens)) {
                setSetupToken(null);
                setServerError('Login failed, please try again');
              }
            }}
            onBack={(message) => {
              setSetupToken(null);
              setServerError(message ?? null);
            }}
          />
        </StaggerItem>
      </Stagger>
    );
  }

  const busy = mutation.isPending || googleMutation.isPending;

  return (
    <Stagger className="w-full max-w-sm">
      <StaggerItem>
        <h1 className="font-heading text-2xl text-ink mb-1">Welcome back</h1>
        <p className="text-sm text-ink-grey mb-8">Log in to continue.</p>
      </StaggerItem>

      <form onSubmit={handleSubmit((v) => { setUnverifiedEmail(null); mutation.mutate(v); })} className="flex flex-col gap-4">
        <StaggerItem>
          <Field id="login-email" label="Email" error={errors.email?.message}>
            <Input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              {...emailField}
              onBlur={(e) => { emailField.onBlur(e); setEmailBlurred(true); }}
            />
          </Field>
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
          <Field id="login-password" label="Password" error={errors.password?.message}>
            <PasswordInput id="login-password" placeholder="Your password" autoComplete="current-password" {...register('password')} />
          </Field>
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

        {unverifiedEmail && (
          <StaggerItem>
            <ResendVerification email={unverifiedEmail} />
          </StaggerItem>
        )}

        <StaggerItem>
          <Button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 min-h-10">
            {mutation.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
            {mutation.isPending ? 'Logging in...' : 'Log in'}
          </Button>
        </StaggerItem>
      </form>

      {googleClientId && (
        <StaggerItem>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-hairline" />
            <span className="text-xs text-ink-grey">or</span>
            <div className="h-px flex-1 bg-hairline" />
          </div>
          <GoogleSignInButton
            clientId={googleClientId}
            text="signin_with"
            disabled={busy}
            onCredential={(credential) => googleMutation.mutate(credential)}
          />
        </StaggerItem>
      )}

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