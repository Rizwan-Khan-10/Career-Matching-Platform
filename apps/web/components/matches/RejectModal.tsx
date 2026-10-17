'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FieldError } from '@/components/ui/FieldError';
import { rejectSchema, type RejectFormValues } from '@/lib/schemas/decision';
import { REJECT_REASONS, toRejectBody, type DecisionBody } from '@/lib/decisions';
import { getErrorMessage } from '@/lib/errors';
import type { Match } from '@/types/match';

const labelClass = 'text-xs text-ink-grey mb-1.5 block';

function RejectForm({
    match,
    candidateName,
    onSubmit,
    onCancel,
}: {
    match: Match;
    candidateName: string;
    onSubmit: (body: DecisionBody) => Promise<unknown>;
    onCancel: () => void;
}) {
    const [serverError, setServerError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<RejectFormValues>({
        resolver: zodResolver(rejectSchema),
        defaultValues: { reasonCategory: match.rejectReason ?? undefined, message: match.rejectMessage ?? '' },
    });
    const reason = REJECT_REASONS.find((r) => r.value === watch('reasonCategory'));

    const submit = handleSubmit(async (values) => {
        setServerError(null);
        try {
            await onSubmit(toRejectBody(values));
        } catch (err) {
            setServerError(getErrorMessage(err, 'Could not save your decision, try again'));
        }
    });

    return (
        <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-ink-grey">
                You are rejecting {candidateName} for this role. They get an in-app notification (no email).
            </p>

            <div>
                <label htmlFor="rj-reason" className={labelClass}>Reason (private) *</label>
                <Select id="rj-reason" {...register('reasonCategory')}>
                    <option value="">Select a reason</option>
                    {REJECT_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                            {r.label}
                        </option>
                    ))}
                </Select>
                <FieldError message={errors.reasonCategory?.message} />
                {reason && (
                    <p className="text-xs text-ink-grey mt-1">
                        {reason.aiFeedback
                            ? 'The candidate also gets AI-written improvement tips for this reason.'
                            : 'For this reason the candidate only gets a polite message.'}
                    </p>
                )}
            </div>

            <div>
                <label htmlFor="rj-message" className={labelClass}>Message to the candidate (optional)</label>
                <Textarea id="rj-message" placeholder="Thank you for your time…" {...register('message')} />
                <FieldError message={errors.message?.message} />
                <p className="text-xs text-ink-grey mt-1">
                    Only this message is shown to the candidate. The reason you pick above stays private.
                </p>
            </div>

            {serverError && <p className="text-sm text-danger">{serverError}</p>}

            <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : match.decision === 'rejected' ? 'Save changes' : 'Reject candidate'}
                </Button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className="text-sm font-medium text-ink-grey hover:text-ink px-4 py-2.5 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}

export function RejectModal({
    match,
    candidateName,
    onClose,
    onSubmit,
}: {
    match: Match | null; // null = closed
    candidateName: string;
    onClose: () => void;
    onSubmit: (body: DecisionBody) => Promise<unknown>;
}) {
    return (
        <Modal
            isOpen={match != null}
            onClose={onClose}
            title={match?.decision === 'rejected' ? 'Edit rejection' : 'Reject candidate'}
        >
            {match && (
                <RejectForm
                    key={match.id}
                    match={match}
                    candidateName={candidateName}
                    onSubmit={onSubmit}
                    onCancel={onClose}
                />
            )}
        </Modal>
    );
}