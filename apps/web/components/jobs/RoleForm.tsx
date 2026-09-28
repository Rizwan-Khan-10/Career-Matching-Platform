'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { SkillsInput } from '@/components/ui/SkillsInput';
import { jobRoleSchema, type JobRoleValues } from '@/lib/schemas/job';
import type { JobRoleRequirements } from '@/types/job';

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
    const [title, setTitle] = useState(initial?.title ?? '');
    const [skills, setSkills] = useState<string[]>(initial?.requirements?.requiredSkills ?? []);
    const [minExperienceYears, setMinExperienceYears] = useState(
        initial?.requirements?.minExperienceYears != null ? String(initial.requirements.minExperienceYears) : '',
    );
    const [qualifications, setQualifications] = useState(initial?.requirements?.qualifications ?? '');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleSave = () => {
        const parsed = jobRoleSchema.safeParse({
            title: title.trim(),
            requiredSkills: skills,
            minExperienceYears: minExperienceYears.trim() === '' ? undefined : Number(minExperienceYears),
            qualifications: qualifications.trim() || undefined,
        });

        if (!parsed.success) {
            const fieldErrors: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
                fieldErrors[issue.path[0] as string] = issue.message;
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
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Backend Engineer" />
                <FieldError message={errors.title} />
            </div>

            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Required skills</label>
                <SkillsInput value={skills} onChange={setSkills} />
                <FieldError message={errors.requiredSkills} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-ink-grey mb-1.5 block">Min. experience (yrs)</label>
                    <Input
                        type="number"
                        step="0.5"
                        value={minExperienceYears}
                        onChange={(e) => setMinExperienceYears(e.target.value)}
                        placeholder="2"
                    />
                    <FieldError message={errors.minExperienceYears} />
                </div>
                <div>
                    <label className="text-xs text-ink-grey mb-1.5 block">Qualifications</label>
                    <Input
                        value={qualifications}
                        onChange={(e) => setQualifications(e.target.value)}
                        placeholder="B.Tech in CS or related"
                    />
                    <FieldError message={errors.qualifications} />
                </div>
            </div>

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