'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { RoleForm } from '@/components/jobs/RoleForm';
import type { JobRole } from '@/types/job';
import type { JobRoleValues } from '@/lib/schemas/job';
import type { RoleStats } from '@/types/stats';
import { LEVEL_LABELS, describeExperience, describeRules, describeSalary } from '@/lib/roleForm';
import { MiniFunnel } from '@/components/stats/FunnelBars';
import { stackLabel, trackLabel } from '@/lib/targetRoles';

export function RoleCard({
    role,
    onSave,
    onDelete,
    isSaving,
    isDeleting,
    stats,
    readOnly = false,
}: {
    role: JobRole;
    onSave: (values: JobRoleValues) => void;
    onDelete: () => void;
    isSaving: boolean;
    isDeleting: boolean;
    stats?: RoleStats;
    readOnly?: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const skills = role.requirements?.requiredSkills ?? [];
    const preferredSkills = role.requirements?.preferredSkills ?? [];
    const req = role.requirements;
    const levelText = req?.level ? LEVEL_LABELS[req.level] : null;
    const stackText = req?.stacks?.length ? req.stacks.map(stackLabel).join(', ') : 'any stack';
    const targetText = req?.track
        ? req.track === 'other'
            ? trackLabel('other')
            : `${trackLabel(req.track)} · ${stackText}`
        : null;
    const rules = describeRules(req);

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
                    {describeExperience(role.requirements) && (
                        <p className="text-xs text-ink-grey mt-0.5">{describeExperience(role.requirements)}</p>
                    )}
                    {describeSalary(role.requirements) && (
                        <p className="text-xs text-ink-grey mt-0.5">{describeSalary(role.requirements)}</p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        disabled={readOnly}
                        className="text-ink-grey hover:text-accent p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Edit role"
                    >
                        <Pencil className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={isDeleting || readOnly}
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

            {preferredSkills.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-xs text-ink-grey">Nice to have:</span>
                    {preferredSkills.map((skill) => (
                        <span key={skill} className="bg-paper text-ink-grey border border-hairline text-xs px-2 py-0.5 rounded-full">
                            {skill}
                        </span>
                    ))}
                </div>
            )}

            {(levelText || targetText) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {levelText && (
                        <span className="bg-paper text-ink border border-hairline text-xs font-medium px-2.5 py-1 rounded-full">
                            {levelText}
                        </span>
                    )}
                    {targetText && (
                        <span className="bg-paper text-ink border border-hairline text-xs font-medium px-2.5 py-1 rounded-full">
                            {targetText}
                        </span>
                    )}
                </div>
            )}

            {rules.length > 0 && <p className="text-xs text-ink-grey mt-2">{rules.join(' · ')}</p>}

            {role.requirements?.qualifications && (
                <p className="text-xs text-ink-grey mt-2">{role.requirements.qualifications}</p>
            )}

            {stats && <MiniFunnel scanned={stats.scanned} matched={stats.matched} applied={stats.applied} />}

            <Link
                href={`/company/roles/${role.id}/applicants`}
                className="text-xs font-medium text-accent hover:underline mt-2.5 inline-block"
            >
                View applicants
            </Link>
        </div>
    );
}