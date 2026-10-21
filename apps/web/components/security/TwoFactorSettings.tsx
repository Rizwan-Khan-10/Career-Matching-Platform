'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import type { TwoFactorSetup, TwoFactorStatus } from '@/types/auth';

type View =
    | { name: 'overview' }
    | { name: 'setup'; setup: TwoFactorSetup }
    | { name: 'codes'; codes: string[] }
    | { name: 'confirm'; action: 'disable' | 'regenerate' };

const STATUS_KEY = ['2fa-status'] as const;

const outlineButton =
    'text-sm font-medium px-4 py-2.5 rounded-lg border border-hairline text-ink hover:border-ink transition-colors disabled:opacity-50';
const linkButton = 'text-sm font-medium text-ink-grey hover:text-ink px-4 py-2.5 transition-colors disabled:opacity-50';

/**
 * `onLockClose(true)` is called while the recovery codes are on screen: they are shown only once,
 * so the surrounding modal must not close on a stray click or Escape.
 */
export function TwoFactorSettings({ onLockClose }: { onLockClose?: (locked: boolean) => void }) {
    const queryClient = useQueryClient();
    const [view, setView] = useState<View>({ name: 'overview' });

    useEffect(() => {
        onLockClose?.(view.name === 'codes');
        return () => onLockClose?.(false);
    }, [view.name, onLockClose]);

    const refreshStatus = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    const toOverview = () => {
        setView({ name: 'overview' });
        refreshStatus();
    };

    if (view.name === 'setup') {
        return (
            <SetupStep
                setup={view.setup}
                onCancel={toOverview}
                onEnabled={(codes) => {
                    setView({ name: 'codes', codes });
                    refreshStatus();
                }}
            />
        );
    }
    if (view.name === 'codes') return <RecoveryCodesStep codes={view.codes} onDone={toOverview} />;
    if (view.name === 'confirm') {
        return (
            <ConfirmStep
                action={view.action}
                onCancel={toOverview}
                onDisabled={() => {
                    toast.success('Two-factor turned off');
                    toOverview();
                }}
                onNewCodes={(codes) => {
                    setView({ name: 'codes', codes });
                    refreshStatus();
                }}
            />
        );
    }
    return (
        <Overview
            onSetup={(setup) => setView({ name: 'setup', setup })}
            onConfirm={(action) => setView({ name: 'confirm', action })}
        />
    );
}

function Overview({
    onSetup,
    onConfirm,
}: {
    onSetup: (setup: TwoFactorSetup) => void;
    onConfirm: (action: 'disable' | 'regenerate') => void;
}) {
    const status = useQuery({
        queryKey: STATUS_KEY,
        queryFn: () => apiClient.get<TwoFactorStatus>('/auth/2fa/status').then((r) => r.data),
    });

    const start = useMutation({
        mutationFn: () => apiClient.post<TwoFactorSetup>('/auth/2fa/setup').then((r) => r.data),
        onSuccess: onSetup,
        onError: (err: unknown) => toast.error(getErrorMessage(err, 'Could not start the setup, try again')),
    });

    if (status.isLoading) return <p className="text-sm text-ink-grey">Loading…</p>;
    if (status.isError || !status.data) {
        return <p className="text-sm text-danger">Could not load your security settings. Please try again.</p>;
    }

    const { enabled, recoveryCodesLeft } = status.data;

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <ShieldCheck className={`size-5 mt-0.5 shrink-0 ${enabled ? 'text-success' : 'text-ink-grey'}`} />
                <div>
                    <p className="text-sm font-medium text-ink">Two-factor authentication is {enabled ? 'on' : 'off'}</p>
                    <p className="text-sm text-ink-grey">
                        {enabled
                            ? 'Logging in needs a 6-digit code from your authenticator app, as well as your password.'
                            : 'Add a second step to login with an authenticator app such as Google Authenticator, Authy or Microsoft Authenticator.'}
                    </p>
                </div>
            </div>

            {enabled ? (
                <>
                    <p className="text-sm text-ink-grey">
                        {recoveryCodesLeft} recovery code{recoveryCodesLeft === 1 ? '' : 's'} left.
                        {recoveryCodesLeft <= 3 && ' Make new ones soon.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={outlineButton} onClick={() => onConfirm('regenerate')}>
                            New recovery codes
                        </button>
                        <button
                            type="button"
                            className={`${outlineButton} hover:text-danger hover:border-danger`}
                            onClick={() => onConfirm('disable')}
                        >
                            Turn off
                        </button>
                    </div>
                </>
            ) : (
                <Button type="button" onClick={() => start.mutate()} disabled={start.isPending}>
                    {start.isPending ? 'Please wait…' : 'Turn on two-factor'}
                </Button>
            )}
        </div>
    );
}

function SetupStep({
    setup,
    onCancel,
    onEnabled,
}: {
    setup: TwoFactorSetup;
    onCancel: () => void;
    onEnabled: (codes: string[]) => void;
}) {
    const [qr, setQr] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    // drawn in the browser: the secret never goes to a third-party QR website
    useEffect(() => {
        let cancelled = false;
        import('qrcode')
            .then((m) => m.toDataURL(setup.otpauthUrl, { width: 192, margin: 1 }))
            .then((url) => {
                if (!cancelled) setQr(url);
            })
            .catch(() => {
                if (!cancelled) setQr(null);
            });
        return () => {
            cancelled = true;
        };
    }, [setup.otpauthUrl]);

    const enable = useMutation({
        mutationFn: (value: string) =>
            apiClient.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code: value }).then((r) => r.data),
        onSuccess: (data) => onEnabled(data.recoveryCodes),
        onError: (err: unknown) => {
            setError(getErrorMessage(err, 'Something went wrong, try again'));
            setCode('');
        },
    });

    const groupedSecret = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;

    const copySecret = async () => {
        try {
            await navigator.clipboard.writeText(setup.secret);
            toast.success('Key copied');
        } catch {
            toast.error('Could not copy, select the key and copy it by hand');
        }
    };

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                if (/^\d{6}$/.test(code)) enable.mutate(code);
            }}
        >
            <p className="text-sm text-ink-grey">
                1. Open your authenticator app and scan this QR code.
            </p>
            <div className="flex justify-center">
                {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR code for your authenticator app" width={192} height={192} className="rounded border border-hairline" />
                ) : (
                    <div className="size-48 flex items-center justify-center text-xs text-ink-grey border border-hairline rounded text-center px-4">
                        Drawing the QR code… If it does not appear, type the key below into your app.
                    </div>
                )}
            </div>
            <div className="flex items-center justify-between gap-2 border border-hairline rounded-lg px-3 py-2">
                <code className="text-xs text-ink break-all">{groupedSecret}</code>
                <button type="button" onClick={copySecret} aria-label="Copy key" className="text-ink-grey hover:text-ink shrink-0">
                    <Copy className="size-4" />
                </button>
            </div>

            <p className="text-sm text-ink-grey">2. Type the 6-digit code your app shows now.</p>
            <Input
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-label="6-digit code"
                className="text-center text-lg tracking-[0.4em]"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-2">
                <Button type="submit" disabled={enable.isPending || code.length !== 6}>
                    {enable.isPending ? 'Checking…' : 'Confirm and turn on'}
                </Button>
                <button type="button" onClick={onCancel} disabled={enable.isPending} className={linkButton}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

function RecoveryCodesStep({ codes, onDone }: { codes: string[]; onDone: () => void }) {
    const [saved, setSaved] = useState(false);
    const text = codes.join('\n');

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Recovery codes copied');
        } catch {
            toast.error('Could not copy, select the codes and copy them by hand');
        }
    };

    const download = () => {
        const blob = new Blob([`CareerMatch recovery codes\nEach code works only once.\n\n${text}\n`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'careermatch-recovery-codes.txt';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <p className="text-sm font-medium text-ink">Save your recovery codes</p>
            <p className="text-sm text-ink-grey">
                If you lose your phone, each of these codes lets you log in once. They are shown only now, so keep them
                somewhere safe.
            </p>
            <div className="grid grid-cols-2 gap-2 border border-hairline rounded-lg p-3">
                {codes.map((c) => (
                    <code key={c} className="text-sm text-ink">{c}</code>
                ))}
            </div>
            <div className="flex gap-2">
                <button type="button" onClick={copy} className={`${outlineButton} inline-flex items-center gap-1.5`}>
                    <Copy className="size-4" /> Copy
                </button>
                <button type="button" onClick={download} className={`${outlineButton} inline-flex items-center gap-1.5`}>
                    <Download className="size-4" /> Download
                </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-grey">
                <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                I have saved these codes
            </label>
            <Button type="button" onClick={onDone} disabled={!saved}>
                Done
            </Button>
        </div>
    );
}

function ConfirmStep({
    action,
    onCancel,
    onDisabled,
    onNewCodes,
}: {
    action: 'disable' | 'regenerate';
    onCancel: () => void;
    onDisabled: () => void;
    onNewCodes: (codes: string[]) => void;
}) {
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'code' | 'recovery'>('code');
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const run = useMutation({
        mutationFn: (body: { password: string; code?: string; recoveryCode?: string }) =>
            apiClient
                .post(action === 'disable' ? '/auth/2fa/disable' : '/auth/2fa/recovery-codes', body)
                .then((r) => r.data),
        onSuccess: (data) => (action === 'disable' ? onDisabled() : onNewCodes(data.recoveryCodes)),
        onError: (err: unknown) => {
            setError(getErrorMessage(err, 'Something went wrong, try again'));
            setValue('');
        },
    });

    const ready = password.length > 0 && value.trim().length > 0;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                if (!ready) return;
                setError(null);
                run.mutate({ password, ...(mode === 'code' ? { code: value.trim() } : { recoveryCode: value.trim() }) });
            }}
        >
            <p className="text-sm text-ink-grey">
                {action === 'disable'
                    ? 'To turn off two-factor, confirm your password and enter a current code.'
                    : 'Making new recovery codes makes all your old ones stop working. Confirm your password and enter a current code.'}
            </p>
            <PasswordInput
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'code' ? (
                <Input
                    value={value}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6-digit code"
                    onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
            ) : (
                <Input
                    value={value}
                    autoComplete="off"
                    maxLength={32}
                    placeholder="Recovery code"
                    onChange={(e) => setValue(e.target.value)}
                />
            )}
            <button
                type="button"
                className="text-sm text-ink-grey underline underline-offset-2 hover:text-ink"
                onClick={() => {
                    setMode((m) => (m === 'code' ? 'recovery' : 'code'));
                    setValue('');
                    setError(null);
                }}
            >
                {mode === 'code' ? 'Use a recovery code instead' : 'Use the app code instead'}
            </button>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
                <Button
                    type="submit"
                    disabled={run.isPending || !ready}
                    className={action === 'disable' ? 'bg-danger hover:bg-danger' : undefined}
                >
                    {run.isPending ? 'Please wait…' : action === 'disable' ? 'Turn off two-factor' : 'Make new codes'}
                </Button>
                <button type="button" onClick={onCancel} disabled={run.isPending} className={linkButton}>
                    Cancel
                </button>
            </div>
        </form>
    );
}