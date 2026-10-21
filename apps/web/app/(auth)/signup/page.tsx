'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { signupSchema, SignupFormValues } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { FieldError } from '@/components/ui/FieldError';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { useFinishLogin } from '@/lib/hooks/useFinishLogin';
import { useRegistrationMode } from '@/lib/hooks/useRegistrationMode';
import { isTwoFactorChallenge, LoginResponse, TokenResponse } from '@/types/auth';

export default function SignupPage() {
    const router = useRouter();
    const finishLogin = useFinishLogin();
    const [serverError, setServerError] = useState<string | null>(null);

    const { data: modeInfo, isLoading: isModeLoading } = useRegistrationMode();
    const isClosed = modeInfo?.mode === 'invite_only';
    const allowedDomains = modeInfo?.mode === 'domain' ? modeInfo.allowedDomains : [];
    // null in college mode (invite_only / domain): the Google button is then not rendered at all
    const googleClientId = modeInfo?.googleEnabled ? modeInfo.googleClientId : null;

    const { register, handleSubmit, control, formState: { errors } } = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: { role: 'APPLICANT' },
    });

    const role = useWatch({ control, name: 'role' });

    const mutation = useMutation({
        mutationFn: (values: SignupFormValues) => apiClient.post<TokenResponse>('/auth/signup', values),
        onSuccess: (res) => {
            if (!finishLogin(res.data)) setServerError('Login failed, please try again');
        },
        onError: (err: unknown) => {
            const msg = getErrorMessage(err, 'Something went wrong');
            setServerError(msg);
            toast.error(msg);
        },
    });

    const googleMutation = useMutation({
        // the chosen role is only used when this Google account has no account yet
        mutationFn: (credential: string) =>
            apiClient.post<LoginResponse>('/auth/google', { credential, role }).then((r) => r.data),
        onSuccess: (data) => {
            setServerError(null);
            if (isTwoFactorChallenge(data)) {
                // this Google account already exists and has two-factor: finish it on the login page
                toast.info('You already have an account. Please log in.');
                router.push('/login');
                return;
            }
            if (!finishLogin(data)) setServerError('Login failed, please try again');
        },
        onError: (err: unknown) => {
            const msg = getErrorMessage(err, 'Google sign-in failed, please try again');
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

    const busy = mutation.isPending || googleMutation.isPending;

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

                {googleClientId && (
                    <StaggerItem>
                        <GoogleSignInButton
                            clientId={googleClientId}
                            text="signup_with"
                            disabled={busy}
                            onCredential={(credential) => googleMutation.mutate(credential)}
                        />
                        <p className="text-xs text-ink-grey mt-2">
                            Already registered with this email? Continuing with Google links it to your account,
                            and your old password stops working. You can set a new one with Forgot password.
                        </p>
                        <div className="flex items-center gap-3 mt-5">
                            <div className="h-px flex-1 bg-hairline" />
                            <span className="text-xs text-ink-grey">or</span>
                            <div className="h-px flex-1 bg-hairline" />
                        </div>
                    </StaggerItem>
                )}

                <StaggerItem>
                    <Input type="email" placeholder="Email" autoComplete="email" {...register('email')} />
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
                    <Button type="submit" disabled={busy} className="w-full">
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