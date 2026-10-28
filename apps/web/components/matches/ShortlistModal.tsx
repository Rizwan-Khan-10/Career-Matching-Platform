'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { toast } from '@/lib/toast';
import { pickDefaults, useSaveShortlistDefaults, useShortlistDefaults, type ShortlistDefaults } from '@/lib/hooks/useShortlistDefaults';
import type { Match } from '@/types/match';

const labelClass = 'text-xs text-ink-grey mb-1.5 block';

function ShortlistForm({
    match,
    candidateName,
    defaults,
    onSubmit,
    onCancel,
}: {
    match: Match;
    candidateName: string;
    defaults: ShortlistDefaults; // the company's saved details (pre-filled for a NEW shortlist, still editable)
    onSubmit: (body: DecisionBody) => Promise<unknown>;
    onCancel: () => void;
}) {
    const info = match.shortlistInfo; // set when the company edits an existing shortlist
    const hasDefaults = Object.keys(defaults).length > 0;
    const [serverError, setServerError] = useState<string | null>(null);
    const [remember, setRemember] = useState(!info); // new shortlist: offer to keep the details for next time
    const saveDefaults = useSaveShortlistDefaults();
    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<ShortlistFormValues>({
        resolver: zodResolver(shortlistSchema),
        defaultValues: {
            roundName: info?.roundName ?? defaults.roundName ?? '',
            mode: info?.mode ?? defaults.mode,
            scheduledAt: toLocalInput(info?.scheduledAt), // never pre-filled from the saved details
            bring: info?.bring ?? defaults.bring ?? '',
            link: info?.link ?? defaults.link ?? '',
            address: info?.address ?? defaults.address ?? '',
            note: info?.note ?? defaults.note ?? '',
        },
    });
    const mode = useWatch({ control, name: 'mode' });

    const submit = handleSubmit(async (values) => {
        setServerError(null);
        try {
            await onSubmit(toShortlistBody(values));
            // the shortlist is saved; keeping the details for next time must never turn that into an error
            if (remember) {
                saveDefaults.mutate(pickDefaults(values), {
                    onError: () => toast.error('Shortlisted, but your details could not be saved for next time'),
                });
            }
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

            {!info && hasDefaults && (
                <p className="text-xs text-ink-grey">
                    Filled in from your saved details. Change anything for this candidate, only the date and time is empty.
                </p>
            )}

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

            <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
                <input type="checkbox" className="mt-1" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>
                    Save these details for my next shortlists
                    <span className="block text-xs text-ink-grey">The date and time is not saved. You can still edit everything each time.</span>
                </span>
            </label>
            {hasDefaults && (
                <button
                    type="button"
                    disabled={saveDefaults.isPending}
                    onClick={() =>
                        saveDefaults.mutate({}, {
                            onSuccess: () => toast.success('Saved details removed'),
                            onError: () => toast.error('Could not remove the saved details'),
                        })
                    }
                    className="text-xs font-medium text-ink-grey hover:text-ink underline disabled:opacity-50"
                >
                    Remove my saved details
                </button>
            )}

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
    const { data: defaults, isPending } = useShortlistDefaults();
    return (
        <Modal
            isOpen={match != null}
            onClose={onClose}
            title={match?.decision === 'shortlisted' ? 'Edit shortlist details' : 'Shortlist candidate'}
        >
            {match && isPending && <p className="text-sm text-ink-grey">Loading your saved details…</p>}
            {match && !isPending && (
                <ShortlistForm
                    key={match.id}
                    match={match}
                    candidateName={candidateName}
                    defaults={defaults ?? {}}
                    onSubmit={onSubmit}
                    onCancel={onClose}
                />
            )}
        </Modal>
    );
}