'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { FieldError } from '@/components/ui/FieldError';
import { rejectJobSchema, type RejectJobValues } from '@/lib/schemas/jobApproval';
import { getErrorMessage } from '@/lib/errors';

function RejectJobForm({
    company,
    onSubmit,
    onClose,
}: {
    company: string;
    onSubmit: (note: string) => Promise<unknown>;
    onClose: () => void;
}) {
    const [serverError, setServerError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<RejectJobValues>({ resolver: zodResolver(rejectJobSchema), defaultValues: { note: '' } });

    const submit = handleSubmit(async (values) => {
        setServerError(null);
        try {
            await onSubmit(values.note);
            onClose();
        } catch (err) {
            setServerError(getErrorMessage(err, 'Could not reject the job, try again'));
        }
    });

    return (
        <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-ink-grey">
                {company} will not be able to match this job. They get a notification with your note.
            </p>
            <div>
                <label htmlFor="reject-job-note" className="text-xs text-ink-grey mb-1.5 block">
                    Note for the company (optional)
                </label>
                <Textarea id="reject-job-note" placeholder="The document is unreadable. Please upload it again." {...register('note')} />
                <FieldError message={errors.note?.message} />
            </div>
            {serverError && <p className="text-sm text-danger">{serverError}</p>}
            <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Rejecting…' : 'Reject job'}
                </Button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="text-sm font-medium text-ink-grey hover:text-ink px-4 py-2.5 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}

export function RejectJobDialog({
    open,
    company,
    onClose,
    onSubmit,
}: {
    open: boolean;
    company: string;
    onClose: () => void;
    onSubmit: (note: string) => Promise<unknown>;
}) {
    return (
        <Modal isOpen={open} onClose={onClose} title="Reject job posting">
            {open && <RejectJobForm company={company} onSubmit={onSubmit} onClose={onClose} />}
        </Modal>
    );
}