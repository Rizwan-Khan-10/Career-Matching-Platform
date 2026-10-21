'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useUserActions } from '@/lib/hooks/useUserActions';
import { getErrorMessage } from '@/lib/errors';
import { toast } from '@/lib/toast';

const buttonClass =
    'text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey transition-colors disabled:opacity-50';

// Deactivate / reactivate / delete for any user (used on the companies and applicants pages)
export function UserLifecycleActions({
    userId,
    name,
    isActive,
    listKey,
}: {
    userId: string;
    name: string;
    isActive: boolean;
    listKey: readonly unknown[];
}) {
    const { setActive, remove, resetTwoFactor } = useUserActions(listKey);
    const [dialog, setDialog] = useState<'deactivate' | 'delete' | 'reset2fa' | null>(null);
    const close = () => setDialog(null);

    const reactivate = async () => {
        try {
            await setActive.mutateAsync({ userId, active: true });
            toast.success(`${name} can log in again`);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not reactivate the account, try again'));
        }
    };

    return (
        <>
            {isActive ? (
                <button type="button" onClick={() => setDialog('deactivate')} className={`${buttonClass} hover:text-ink`}>
                    Deactivate
                </button>
            ) : (
                <button type="button" onClick={reactivate} disabled={setActive.isPending} className={`${buttonClass} hover:text-success hover:border-success`}>
                    Reactivate
                </button>
            )}
            <button type="button" onClick={() => setDialog('reset2fa')} className={`${buttonClass} hover:text-ink`}>
                Reset 2FA
            </button>
            <button type="button" onClick={() => setDialog('delete')} className={`${buttonClass} hover:text-danger hover:border-danger`}>
                Delete
            </button>

            <ConfirmDialog
                open={dialog === 'deactivate'}
                title="Deactivate account"
                message={`${name} will be signed out and will not be able to log in until you reactivate the account.`}
                confirmLabel="Deactivate"
                onClose={close}
                onConfirm={async () => {
                    await setActive.mutateAsync({ userId, active: false });
                    toast.success(`${name} deactivated`);
                }}
            />
            <ConfirmDialog
                open={dialog === 'delete'}
                title="Delete account"
                message={`This permanently deletes the account of ${name}. This cannot be undone.`}
                confirmLabel="Delete account"
                danger
                onClose={close}
                onConfirm={async () => {
                    await remove.mutateAsync(userId);
                    toast.success(`${name} deleted`);
                }}
            />
            <ConfirmDialog
                open={dialog === 'reset2fa'}
                title="Reset two-factor"
                message={`${name} will be signed out everywhere and can log in with just their password until they turn two-factor on again. Only do this after you have checked who is asking.`}
                confirmLabel="Reset 2FA"
                onClose={close}
                onConfirm={async () => {
                    await resetTwoFactor.mutateAsync(userId);
                    toast.success(`Two-factor reset for ${name}`);
                }}
            />
        </>
    );
}