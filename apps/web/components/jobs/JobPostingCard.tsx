'use client';

import { useState } from 'react';
import { AlertTriangle, PauseCircle, Plus } from 'lucide-react';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { RoleCard } from '@/components/jobs/RoleCard';
import { RoleForm } from '@/components/jobs/RoleForm';
import type { JobPosting } from '@/types/job';
import type { JobRoleValues } from '@/lib/schemas/job';
import type { RoleStats } from '@/types/stats';
import { JobApprovalBadge } from '@/components/jobs/JobApprovalBadge';

export function JobPostingCard({
    posting,
    onAddRole,
    onUpdateRole,
    onDeleteRole,
    onStop,
    onReopen,
    statsByRole,
    isMutating,
    canManage = true,
}: {
    posting: JobPosting;
    onAddRole: (values: JobRoleValues) => void;
    onUpdateRole: (roleId: string, values: JobRoleValues) => void;
    onDeleteRole: (roleId: string) => void;
    onStop: () => void;
    onReopen: () => void;
    statsByRole?: Record<string, RoleStats>;
    isMutating: boolean;
    canManage?: boolean;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [confirmingStop, setConfirmingStop] = useState(false);
    const isStopped = !!posting.stoppedAt;
    const approval = posting.approvalStatus ?? 'approved'; // old rows have no value
    const awaitingApproval = approval === 'pending';
    const isRejected = approval === 'rejected';

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-ink">
                    Requirement doc · {new Date(posting.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {isStopped ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-paper text-ink-grey border border-hairline">
                        <PauseCircle className="size-3.5" />
                        Stopped
                    </span>
                ) : (
                    <JobStatusBadge status={posting.status} />
                )}
            </div>

            {isStopped ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-paper text-ink-grey border border-hairline">
                    <PauseCircle className="size-3.5" />
                    Stopped
                </span>
            ) : approval !== 'approved' ? (
                <JobApprovalBadge status={approval} />
            ) : (
                <JobStatusBadge status={posting.status} />
            )}

            {awaitingApproval && (
                <p className="text-sm text-ink-grey bg-paper rounded-lg px-3.5 py-3">
                    An admin needs to approve this job before it is read and matched. You will get a notification once
                    it is reviewed.
                </p>
            )}

            {isRejected && (
                <div className="flex items-start gap-2.5 text-sm text-danger bg-danger-soft rounded-lg px-3.5 py-3">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">An admin did not approve this job</p>
                        <p className="text-danger/80 mt-0.5">
                            {posting.approvalNote || 'No reason was given.'} It will not be scanned or matched.
                        </p>
                    </div>
                </div>
            )}

            {posting.status === 'pending' && approval === 'approved' && (
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
                            {' '}Upload a new file (PDF, DOCX, TXT or image) to try again, or add roles manually below.
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
                            stats={statsByRole?.[role.id]}
                            readOnly={!canManage}
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
                        disabled={!canManage}
                        title={canManage ? undefined : 'Available after admin approval'}
                        className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-ink transition-colors mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="size-3.5" />
                        Add role
                    </button>
                )
            )}

            <div className="border-t border-hairline mt-4 pt-3 flex items-center justify-end gap-3">
                {isStopped ? (
                    <button
                        type="button"
                        disabled={isMutating}
                        onClick={onReopen}
                        className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                        Reopen job
                    </button>
                ) : confirmingStop ? (
                    <>
                        <span className="text-xs text-ink-grey">Stop scanning and matching for this job?</span>
                        <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => {
                                setConfirmingStop(false);
                                onStop();
                            }}
                            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                        >
                            Yes, stop
                        </button>
                        <button type="button" onClick={() => setConfirmingStop(false)} className="text-xs font-medium text-ink-grey hover:text-ink">
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => setConfirmingStop(true)}
                        className="text-xs font-medium text-ink-grey hover:text-danger disabled:opacity-50"
                    >
                        Stop job
                    </button>
                )}
            </div>
        </div>
    );
}