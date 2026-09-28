'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { RoleForm } from '@/components/jobs/RoleForm';
import type { JobRole } from '@/types/job';
import type { JobRoleValues } from '@/lib/schemas/job';

export function RoleCard({
    role,
    onSave,
    onDelete,
    isSaving,
    isDeleting,
}: {
    role: JobRole;
    onSave: (values: JobRoleValues) => void;
    onDelete: () => void;
    isSaving: boolean;
    isDeleting: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const skills = role.requirements?.requiredSkills ?? [];

    if (isEditing) {
        return (
            <div className="border border-hairline rounded-lg p-3.5">
                <RoleForm
                    initial={{ title: role.title, requirements: role.requirements }}
                    onCancel={() => setIsEditing(false)}
                    onSave={(values) => {
                        onSave(values);
                        setIsEditing(false);
                    }}
                    isSaving={isSaving}
                />
            </div>
        );
    }

    return (
        <div className="border border-hairline rounded-lg p-3.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        href={`/company/roles/${role.id}/applicants`}
                        className="text-sm font-medium text-ink hover:text-accent transition-colors"
                    >
                        {role.title}
                    </Link>
                    {role.requirements?.minExperienceYears != null && (
                        <p className="text-xs text-ink-grey mt-0.5">
                            {role.requirements.minExperienceYears}+ yrs experience
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="text-ink-grey hover:text-accent p-1 transition-colors"
                        aria-label="Edit role"
                    >
                        <Pencil className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={isDeleting}
                        className="text-ink-grey hover:text-danger p-1 transition-colors disabled:opacity-50"
                        aria-label="Delete role"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            </div>

            {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {skills.map((skill) => (
                        <span
                            key={skill}
                            className="bg-accent-soft text-accent text-xs font-medium px-2.5 py-1 rounded-full"
                        >
                            {skill}
                        </span>
                    ))}
                </div>
            )}

            {role.requirements?.qualifications && (
                <p className="text-xs text-ink-grey mt-2">{role.requirements.qualifications}</p>
            )}

            <Link
                href={`/company/roles/${role.id}/applicants`}
                className="text-xs font-medium text-accent hover:underline mt-2.5 inline-block"
            >
                View applicants
            </Link>
        </div>
    );
}