'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { RecoveryCodesStep, SetupStep } from '@/components/security/TwoFactorSettings';
import type { TokenResponse, TwoFactorSetup } from '@/types/auth';

type FinishResponse = TokenResponse & { recoveryCodes: string[] };

/** Shown instead of the login form when an admin must set up two-factor before getting a session. */
export function AdminTwoFactorSetup({
    setupToken,
    onSuccess,
    onBack,
}: {
    setupToken: string;
    onSuccess: (tokens: TokenResponse) => void;
    /** message is set when the setup session expired */
    onBack: (message?: string) => void;
}) {
    const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
    const [finished, setFinished] = useState<FinishResponse | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);

    const start = useMutation({
        mutationFn: () =>
            apiClient.post<TwoFactorSetup>('/auth/2fa/setup-login/start', { setupToken }).then((r) => r.data),
        onSuccess: setSetup,
        onError: (err: unknown) => {
            const msg = getErrorMessage(err, 'Could not start the setup, try again');
            if (msg.startsWith('Login session expired')) onBack(msg);
            else toast.error(msg);
        },
    });

    // the tokens are kept here until the recovery codes were seen: Done finishes the login
    if (finished && codes) {
        return <RecoveryCodesStep codes={codes} onDone={() => onSuccess(finished)} />;
    }

    if (setup) {
        return (
            <SetupStep
                setup={setup}
                onCancel={() => onBack()}
                onConfirm={async (code) => {
                    const res = await apiClient
                        .post<FinishResponse>('/auth/2fa/setup-login/finish', { setupToken, code })
                        .then((r) => r.data);
                    setFinished(res);
                    return res.recoveryCodes;
                }}
                onEnabled={setCodes}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 mt-0.5 shrink-0 text-ink-grey" />
                <p className="text-sm text-ink-grey">
                    Admin accounts must use two-factor authentication. You need an authenticator app such as Google
                    Authenticator, Authy or Microsoft Authenticator. This takes about a minute.
                </p>
            </div>
            <Button type="button" className="w-full" onClick={() => start.mutate()} disabled={start.isPending}>
                {start.isPending ? 'Please wait…' : 'Set up two-factor'}
            </Button>
            <button
                type="button"
                onClick={() => onBack()}
                className="text-sm text-ink-grey underline underline-offset-2 hover:text-ink"
            >
                Back
            </button>
        </div>
    );
}