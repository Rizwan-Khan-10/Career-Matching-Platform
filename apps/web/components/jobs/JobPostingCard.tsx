'use client';

import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { RoleCard } from '@/components/jobs/RoleCard';
import { RoleForm } from '@/components/jobs/RoleForm';
import type { JobPosting } from '@/types/job';
import type { JobRoleValues } from '@/lib/schemas/job';

export function JobPostingCard({
    posting,
    onAddRole,
    onUpdateRole,
    onDeleteRole,
    isMutating,
}: {
    posting: JobPosting;
    onAddRole: (values: JobRoleValues) => void;
    onUpdateRole: (roleId: string, values: JobRoleValues) => void;
    onDeleteRole: (roleId: string) => void;
    isMutating: boolean;
}) {
    const [isAdding, setIsAdding] = useState(false);

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-ink">
                    Requirement doc · {new Date(posting.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <JobStatusBadge status={posting.status} />
            </div>

            {posting.status === 'pending' && (
                <p className="text-sm text-ink-grey">
                    Reading through the document — roles and requirements will show up here shortly.
                </p>
            )}

            {posting.status === 'failed' && (
                <div className="flex items-start gap-2.5 text-sm text-danger bg-danger-soft rounded-lg px-3.5 py-3">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">Couldn&apos;t extract roles from this document</p>
                        <p className="text-danger/80 mt-0.5">
                            {posting.errorMessage || 'The file may be corrupted, empty, or in an unsupported format.'}
                            {' '}Upload a new PDF or DOCX to try again, or add roles manually below.
                        </p>
                    </div>
                </div>
            )}

            {posting.roles.length > 0 && (
                <div className="space-y-2.5 mt-1">
                    {posting.roles.map((role) => (
                        <RoleCard
                            key={role.id}
                            role={role}
                            isSaving={isMutating}
                            isDeleting={isMutating}
                            onSave={(values) => onUpdateRole(role.id, values)}
                            onDelete={() => onDeleteRole(role.id)}
                        />
                    ))}
                </div>
            )}

            {posting.status !== 'pending' && (
                isAdding ? (
                    <div className="border border-dashed border-hairline rounded-lg p-3.5 mt-2.5">
                        <RoleForm
                            submitLabel="Add role"
                            onCancel={() => setIsAdding(false)}
                            onSave={(values) => {
                                onAddRole(values);
                                setIsAdding(false);
                            }}
                            isSaving={isMutating}
                        />
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-ink transition-colors mt-3"
                    >
                        <Plus className="size-3.5" />
                        Add role
                    </button>
                )
            )}
        </div>
    );
}