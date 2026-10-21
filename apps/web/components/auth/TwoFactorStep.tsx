'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { TokenResponse } from '@/types/auth';

export function TwoFactorStep({
    challengeId,
    onSuccess,
    onBack,
}: {
    challengeId: string;
    onSuccess: (tokens: TokenResponse) => void;
    /** message is set when the challenge expired, so the login page can explain why we are back */
    onBack: (message?: string) => void;
}) {
    const [mode, setMode] = useState<'code' | 'recovery'>('code');
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const verify = useMutation({
        mutationFn: (body: { code?: string; recoveryCode?: string }) =>
            apiClient.post<TokenResponse>('/auth/2fa/verify', { challengeId, ...body }).then((r) => r.data),
        onSuccess: (tokens) => onSuccess(tokens),
        onError: (err: unknown) => {
            const msg = getErrorMessage(err, 'Something went wrong');
            if (msg.startsWith('Login session expired')) {
                onBack(msg);
                return;
            }
            setError(msg);
            setValue('');
            inputRef.current?.focus();
        },
    });

    const submit = (v: string) => {
        setError(null);
        verify.mutate(mode === 'code' ? { code: v } : { recoveryCode: v });
    };

    const switchMode = () => {
        setMode((m) => (m === 'code' ? 'recovery' : 'code'));
        setValue('');
        setError(null);
    };

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-grey">
                {mode === 'code'
                    ? 'Enter the 6-digit code from your authenticator app.'
                    : 'Enter one of your recovery codes. Each code works only once.'}
            </p>

            {mode === 'code' ? (
                <Input
                    key="code"
                    ref={inputRef}
                    value={value}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    placeholder="123456"
                    aria-label="6-digit code"
                    className="text-center text-lg tracking-[0.4em]"
                    readOnly={verify.isPending}
                    onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setValue(digits);
                        if (digits.length === 6 && !verify.isPending) submit(digits);
                    }}
                />
            ) : (
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (value.trim() && !verify.isPending) submit(value.trim());
                    }}
                >
                    <Input
                        key="recovery"
                        ref={inputRef}
                        value={value}
                        autoComplete="off"
                        autoFocus
                        maxLength={32}
                        placeholder="xxxxx-xxxxx"
                        aria-label="Recovery code"
                        readOnly={verify.isPending}
                        onChange={(e) => setValue(e.target.value)}
                    />
                    <Button type="submit" disabled={verify.isPending || !value.trim()} className="w-full">
                        {verify.isPending ? 'Checking...' : 'Verify'}
                    </Button>
                </form>
            )}

            {verify.isPending && mode === 'code' && <p className="text-sm text-ink-grey">Checking...</p>}
            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={switchMode} className="text-ink-grey underline underline-offset-2 hover:text-ink">
                    {mode === 'code' ? 'Use a recovery code' : 'Use the app code instead'}
                </button>
                <button type="button" onClick={() => onBack()} className="text-ink-grey underline underline-offset-2 hover:text-ink">
                    Back
                </button>
            </div>
        </div>
    );
}