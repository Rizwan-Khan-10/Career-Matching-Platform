'use client';

import { Input } from '@/components/ui/Input';
import { FieldError } from '@/components/ui/FieldError';
import { SkillsInput } from '@/components/ui/SkillsInput';
import type { RoleFormState } from '@/lib/roleForm';

export function EligibilityFields({
    form,
    onChange,
    errors,
}: {
    form: RoleFormState;
    onChange: (patch: Partial<RoleFormState>) => void;
    errors: Record<string, string>;
}) {
    return (
        <fieldset className="border border-hairline rounded-lg p-3.5 space-y-3">
            <legend className="text-xs font-medium text-ink px-1">Eligibility rules (optional)</legend>
            <p className="text-xs text-ink-grey -mt-1">
                Leave a field empty to skip that rule. If an applicant&apos;s value is unknown, they stay eligible and
                you see it as &quot;not verified&quot;.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label htmlFor="role-min-cgpa" className="text-xs text-ink-grey mb-1.5 block">
                        Min. CGPA (out of 10)
                    </label>
                    <Input
                        id="role-min-cgpa"
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={form.minCgpa}
                        onChange={(e) => onChange({ minCgpa: e.target.value })}
                        placeholder="7.0"
                    />
                    <FieldError message={errors.minCgpa} />
                </div>
                <div>
                    <label htmlFor="role-max-backlogs" className="text-xs text-ink-grey mb-1.5 block">
                        Max. backlogs
                    </label>
                    <Input
                        id="role-max-backlogs"
                        type="number"
                        step="1"
                        min="0"
                        value={form.maxBacklogs}
                        onChange={(e) => onChange({ maxBacklogs: e.target.value })}
                        placeholder="0"
                    />
                    <FieldError message={errors.maxBacklogs} />
                </div>
            </div>

            <div>
                <label className="text-xs text-ink-grey mb-1.5 block">Allowed branches</label>
                <SkillsInput
                    value={form.allowedBranches}
                    onChange={(allowedBranches) => onChange({ allowedBranches })}
                    placeholder="Type a branch and press Enter…"
                />
                <FieldError message={errors.allowedBranches} />
            </div>

            <div>
                <label htmlFor="role-passing-years" className="text-xs text-ink-grey mb-1.5 block">
                    Passing years
                </label>
                <Input
                    id="role-passing-years"
                    value={form.passingYears}
                    onChange={(e) => onChange({ passingYears: e.target.value })}
                    placeholder="2026, 2027"
                />
                <FieldError message={errors.passingYears} />
            </div>
        </fieldset>
    );
}