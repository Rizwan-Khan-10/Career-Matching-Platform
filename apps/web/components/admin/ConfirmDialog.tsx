'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/errors';

function ConfirmBody({
    message,
    confirmLabel,
    danger,
    onConfirm,
    onClose,
}: {
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => Promise<unknown>;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, 'Something went wrong, try again'));
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-ink-grey">{message}</p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
                <Button type="button" onClick={run} disabled={busy} className={danger ? 'bg-danger hover:bg-danger' : undefined}>
                    {busy ? 'Please wait…' : confirmLabel}
                </Button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="text-sm font-medium text-ink-grey hover:text-ink px-4 py-2.5 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// the body is mounted only while open, so its busy/error state resets every time
export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    danger = false,
    onConfirm,
    onClose,
}: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<unknown>; // throw to keep the dialog open and show the error
    onClose: () => void;
}) {
    return (
        <Modal isOpen={open} onClose={onClose} title={title}>
            {open && (
                <ConfirmBody message={message} confirmLabel={confirmLabel} danger={danger} onConfirm={onConfirm} onClose={onClose} />
            )}
        </Modal>
    );
}