'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { SkillsInput } from '@/components/ui/SkillsInput';
import { Switch } from '@/components/ui/Switch';
import { adminSettingsSchema, normalizeDomains, type AdminSettingsValues } from '@/lib/schemas/adminSettings';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { AdminSettings } from '@/types/admin';
import type { RegistrationMode } from '@/types/auth';

const MODES: { value: RegistrationMode; title: string; text: string }[] = [
    { value: 'open', title: 'Open', text: 'Anyone can sign up as an applicant or a company.' },
    { value: 'domain', title: 'Email domain', text: 'Only people with an email from the domains you list can sign up.' },
    {
        value: 'invite_only',
        title: 'Invite only',
        text: 'Self-signup is closed. Only the accounts you add by CSV import can log in. Typical for an institution.',
    },
];

function SwitchRow({
    title,
    text,
    note,
    checked,
    disabled,
    onChange,
}: {
    title: string;
    text: string;
    note?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <div>
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs text-ink-grey mt-0.5">{text}</p>
                {note && <p className="text-xs text-accent mt-1">{note}</p>}
            </div>
            <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
        </div>
    );
}

export function RegistrationSettingsForm({
    initial,
    onSave,
}: {
    initial: AdminSettings;
    onSave: (values: AdminSettings) => Promise<unknown>;
}) {
    const [serverError, setServerError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        control,
        setValue,
        reset,
        formState: { errors, isDirty, isSubmitting },
    } = useForm<AdminSettingsValues>({ resolver: zodResolver(adminSettingsSchema), defaultValues: initial });

    const mode = useWatch({ control, name: 'registrationMode' });
    const domains = useWatch({ control, name: 'allowedDomains' });
    const companyApproval = useWatch({ control, name: 'companyApprovalRequired' });
    const jobApproval = useWatch({ control, name: 'jobApprovalRequired' });
    const flag = (name: 'companyApprovalRequired' | 'jobApprovalRequired') => (next: boolean) =>
        setValue(name, next, { shouldDirty: true });

    const submit = handleSubmit(async (values) => {
        setServerError(null);
        try {
            await onSave(values);
            reset(values);
        } catch (err) {
            setServerError(getErrorMessage(err, 'Could not save the settings, try again'));
        }
    });

    return (
        <form onSubmit={submit} noValidate className="space-y-6">
            <section>
                <h2 className="font-heading text-lg text-ink mb-1">Who can sign up</h2>
                <p className="text-sm text-ink-grey mb-3">This is checked on the server, not only on the signup page.</p>
                <div className="space-y-2" role="radiogroup" aria-label="Registration mode">
                    {MODES.map((m) => (
                        <label
                            key={m.value}
                            className={cn(
                                'flex items-start gap-3 border rounded-xl p-3.5 cursor-pointer transition-colors',
                                mode === m.value ? 'border-accent bg-accent-soft/40' : 'border-hairline bg-paper-raised hover:border-ink-grey',
                            )}
                        >
                            <input type="radio" value={m.value} {...register('registrationMode')} className="mt-1 accent-[var(--color-accent)]" />
                            <span>
                                <span className="block text-sm font-medium text-ink">{m.title}</span>
                                <span className="block text-xs text-ink-grey mt-0.5">{m.text}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <FieldError message={errors.registrationMode?.message} />

                {mode === 'invite_only' && (
                    <p className="text-xs text-ink-grey mt-2">
                        People without an account will not be able to sign up. Add them from{' '}
                        <Link href="/admin/import" className="text-accent underline underline-offset-2">
                            Import users
                        </Link>
                        .
                    </p>
                )}

                {mode === 'domain' && (
                    <div className="mt-3">
                        <label className="text-xs text-ink-grey mb-1.5 block">Allowed email domains</label>
                        <SkillsInput
                            value={domains}
                            onChange={(next) =>
                                setValue('allowedDomains', normalizeDomains(next), { shouldDirty: true, shouldValidate: true })
                            }
                            placeholder="college.edu, then press Enter…"
                        />
                        <FieldError message={errors.allowedDomains?.message} />
                    </div>
                )}
            </section>

            <section className="bg-paper-raised border border-hairline rounded-xl px-4 divide-y divide-hairline">
                <SwitchRow
                    title="Approve new companies"
                    text="A company that signs up on its own stays pending and cannot upload job documents until you approve it. Companies you import are always approved."
                    note={mode === 'invite_only' ? 'Not used in invite-only mode: nobody signs up on their own.' : undefined}
                    checked={companyApproval}
                    disabled={mode === 'invite_only'}
                    onChange={flag('companyApprovalRequired')}
                />
                <SwitchRow
                    title="Approve new job postings"
                    text="A new job posting waits for your approval before it is read and matched with applicants."
                    checked={jobApproval}
                    onChange={flag('jobApprovalRequired')}
                />
            </section>

            {serverError && <p className="text-sm text-danger">{serverError}</p>}

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                    {isSubmitting ? 'Saving…' : 'Save settings'}
                </Button>
                {!isDirty && <span className="text-xs text-ink-grey">No unsaved changes</span>}
            </div>
        </form>
    );
}