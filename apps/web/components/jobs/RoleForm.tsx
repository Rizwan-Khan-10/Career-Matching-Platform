'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { SkillsInput } from '@/components/ui/SkillsInput';
import { RoleStackPicker } from '@/components/jobs/RoleStackPicker';
import { EligibilityFields } from '@/components/jobs/EligibilityFields';
import { jobRoleSchema, type JobRoleValues } from '@/lib/schemas/job';
import { experienceWarning, LEVEL_LABELS, onLevelChange, toFormState, toPayload, type RoleFormState } from '@/lib/roleForm';
import type { JobRoleRequirements } from '@/types/job';

const selectClass =
    'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink';

export function RoleForm({
    initial,
    onCancel,
    onSave,
    isSaving,
    submitLabel = 'Save changes',
}: {
    initial?: { title: string; requirements: JobRoleRequirements | null };
    onCancel: () => void;
    onSave: (values: JobRoleValues) => void;
    isSaving: boolean;
    submitLabel?: string;
}) {
    const [form, setForm] = useState<RoleFormState>(() => toFormState(initial));
    const [errors, setErrors] = useState<Record<string, string>>({});

    const update = (patch: Partial<RoleFormState>) => setForm((prev) => ({ ...prev, ...patch }));

    const handleSave = () => {
        const parsed = jobRoleSchema.safeParse(toPayload(form));

        if (!parsed.success) {
            const fieldErrors: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
                const key = issue.path[0] as string;
                if (!fieldErrors[key]) fieldErrors[key] = issue.message;
            }
            setErrors(fieldErrors);
            return;
        }
        setErrors({});
        onSave(parsed.data);
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Role title</label>
                <Input value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="Backend Engineer" />
                <FieldError message={errors.title} />
            </div>

            <RoleStackPicker
                track={form.track}
                stacks={form.stacks}
                onChange={(next) => update({ track: next.track, stacks: next.stacks })}
            />
            <FieldError message={errors.track ?? errors.stacks} />

            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Required skills</label>
                <SkillsInput value={form.skills} onChange={(skills) => update({ skills })} />
                <FieldError message={errors.requiredSkills} />
            </div>

            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Preferred skills (nice to have)</label>
                <SkillsInput value={form.preferred} onChange={(preferred) => update({ preferred })} />
                <FieldError message={errors.preferredSkills} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label htmlFor="role-level" className="text-xs text-ink-grey mb-1.5 block">
                        Level
                    </label>
                    <select
                        id="role-level"
                        value={form.level}
                        onChange={(e) => update(onLevelChange(form, e.target.value))}
                        className={selectClass}
                    >
                        <option value="">Not set</option>
                        {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <FieldError message={errors.level} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-ink-grey mb-1.5 block">Min. experience (yrs)</label>
                        <Input
                            type="number"
                            step="0.5"
                            min="0"
                            value={form.minExperienceYears}
                            onChange={(e) => update({ minExperienceYears: e.target.value })}
                            placeholder="2"
                        />
                        <FieldError message={errors.minExperienceYears} />
                    </div>
                    <div>
                        <label className="text-xs text-ink-grey mb-1.5 block">Max. experience (yrs)</label>
                        <Input
                            type="number"
                            step="0.5"
                            min="0"
                            value={form.maxExperienceYears}
                            onChange={(e) => update({ maxExperienceYears: e.target.value })}
                            placeholder="No limit"
                        />
                        <FieldError message={errors.maxExperienceYears} />
                    </div>
                </div>
            </div>

            {experienceWarning(form) && <p className="text-xs text-ink-grey">{experienceWarning(form)}</p>}

            <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
                <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.strictMinExperience}
                    disabled={form.minExperienceYears.trim() === ''}
                    onChange={(e) => update({ strictMinExperience: e.target.checked })}
                />
                <span>
                    Reject candidates below the minimum
                    <span className="block text-xs text-ink-grey">
                        Off: someone slightly below the minimum can still show up as a possible match. On: below the minimum is always rejected.
                    </span>
                </span>
            </label>

            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Qualifications</label>
                <Input
                    value={form.qualifications}
                    onChange={(e) => update({ qualifications: e.target.value })}
                    placeholder="B.Tech in CS or related"
                />
                <FieldError message={errors.qualifications} />
            </div>

            <EligibilityFields form={form} onChange={update} errors={errors} />

            <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving…' : submitLabel}
                </Button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="text-sm font-medium text-ink-grey hover:text-ink px-4 py-2.5 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}