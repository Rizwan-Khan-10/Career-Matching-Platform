'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FieldError } from '@/components/ui/FieldError';
import { shortlistSchema, type ShortlistFormValues } from '@/lib/schemas/decision';
import { MODE_OPTIONS, toLocalInput, toShortlistBody, type DecisionBody } from '@/lib/decisions';
import { getErrorMessage } from '@/lib/errors';
import type { Match } from '@/types/match';

const labelClass = 'text-xs text-ink-grey mb-1.5 block';

function ShortlistForm({
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
    const info = match.shortlistInfo; // set when the company edits an existing shortlist
    const [serverError, setServerError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ShortlistFormValues>({
        resolver: zodResolver(shortlistSchema),
        defaultValues: {
            roundName: info?.roundName ?? '',
            mode: info?.mode,
            scheduledAt: toLocalInput(info?.scheduledAt),
            bring: info?.bring ?? '',
            link: info?.link ?? '',
            address: info?.address ?? '',
            note: info?.note ?? '',
        },
    });
    const mode = watch('mode');

    const submit = handleSubmit(async (values) => {
        setServerError(null);
        try {
            await onSubmit(toShortlistBody(values));
        } catch (err) {
            setServerError(getErrorMessage(err, 'Could not save your decision, try again'));
        }
    });

    return (
        <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-ink-grey">
                {candidateName} gets these details by email and as a notification, exactly as you write them. They also
                get AI prep tips, kept separate from your details.
            </p>

            <div>
                <label htmlFor="sl-round" className={labelClass}>Round name *</label>
                <Input id="sl-round" placeholder="Technical round 1" {...register('roundName')} />
                <FieldError message={errors.roundName?.message} />
            </div>

            <div>
                <label htmlFor="sl-mode" className={labelClass}>Mode *</label>
                <Select id="sl-mode" {...register('mode')}>
                    <option value="">Select a mode</option>
                    {MODE_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                            {m.label}
                        </option>
                    ))}
                </Select>
                <FieldError message={errors.mode?.message} />
            </div>

            <div>
                <label htmlFor="sl-when" className={labelClass}>Date and time (optional)</label>
                <Input id="sl-when" type="datetime-local" {...register('scheduledAt')} />
                <FieldError message={errors.scheduledAt?.message} />
            </div>

            {mode === 'online' && (
                <div>
                    <label htmlFor="sl-link" className={labelClass}>Meeting link (optional)</label>
                    <Input id="sl-link" placeholder="https://meet.example.com/…" {...register('link')} />
                    <FieldError message={errors.link?.message} />
                </div>
            )}

            {mode === 'offline' && (
                <div>
                    <label htmlFor="sl-address" className={labelClass}>Address (optional)</label>
                    <Textarea id="sl-address" rows={2} placeholder="Floor, building, area, city" {...register('address')} />
                    <FieldError message={errors.address?.message} />
                </div>
            )}

            {mode === 'phone' && (
                <p className="text-xs text-ink-grey">
                    Add the phone number or who will call in the note below.
                </p>
            )}

            <div>
                <label htmlFor="sl-bring" className={labelClass}>What to bring or prepare (optional)</label>
                <Textarea id="sl-bring" rows={2} placeholder="Photo ID, printed resume, laptop…" {...register('bring')} />
                <FieldError message={errors.bring?.message} />
            </div>

            <div>
                <label htmlFor="sl-note" className={labelClass}>Note (optional)</label>
                <Textarea id="sl-note" {...register('note')} />
                <FieldError message={errors.note?.message} />
            </div>

            {serverError && <p className="text-sm text-danger">{serverError}</p>}

            <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : info ? 'Save details' : 'Shortlist candidate'}
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

export function ShortlistModal({
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
            title={match?.decision === 'shortlisted' ? 'Edit shortlist details' : 'Shortlist candidate'}
        >
            {match && (
                <ShortlistForm
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