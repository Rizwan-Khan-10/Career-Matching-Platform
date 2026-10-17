'use client';

import { useState } from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/resume/StatusBadge';
import { ResumeSummary } from '@/components/resume/ResumeSummary';
import { ResumeEditForm } from '@/components/resume/ResumeEditForm';
import type { Resume } from '@/types/resume';
import type { UpdateResumeValues } from '@/lib/schemas/resume';

const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function ConfirmBadge({ confirmed }: { confirmed: boolean }) {
    return (
        <span
            className={
                confirmed
                    ? 'inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-success-soft text-success'
                    : 'inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-paper text-ink-grey border border-hairline'
            }
        >
            {confirmed ? 'Confirmed' : 'Not confirmed'}
        </span>
    );
}

export function ResumeCard({
    resume,
    replaces,
    onSave,
    isSaving,
    onDelete,
    isDeleting,
}: {
    resume: Resume;
    /** the confirmed resume with the same target that confirming this one would replace */
    replaces?: Resume;
    onSave: (values: UpdateResumeValues) => void;
    isSaving: boolean;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const isConfirmed = !!resume.confirmedAt;

    const handleSave = (values: UpdateResumeValues) => {
        onSave(values);
        setIsEditing(false);
    };

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{resume.targetLabel || 'Resume'}</p>
                    <p className="text-xs text-ink-grey mt-0.5">Uploaded {fmt(resume.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {resume.status === 'parsed' && <ConfirmBadge confirmed={isConfirmed} />}
                    <StatusBadge status={resume.status} />
                </div>
            </div>

            {!isConfirmed && resume.status !== 'failed' && (
                <div className="flex items-start gap-2 text-xs text-ink-grey bg-paper rounded-lg px-3 py-2.5 mb-4">
                    <Info className="size-3.5 shrink-0 mt-0.5" />
                    <p>
                        Not confirmed yet, so it is not matched with any role. Review and confirm it to start matching.
                        {replaces && (
                            <>
                                {' '}Confirming will replace your current{' '}
                                <span className="font-medium text-ink">{replaces.targetLabel}</span> resume from {fmt(replaces.createdAt)}.
                            </>
                        )}
                    </p>
                </div>
            )}

            {resume.status === 'pending' && (
                <p className="text-sm text-ink-grey">
                    Reading through your resume — skills, education and projects will show up here shortly.
                </p>
            )}

            {resume.status === 'failed' && (
                <div className="flex items-start gap-2.5 text-sm text-danger bg-danger-soft rounded-lg px-3.5 py-3">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">Couldn&apos;t process this resume</p>
                        <p className="text-danger/80 mt-0.5">
                            {resume.parsedData?.error || 'The file may be corrupted, empty, or in an unsupported format.'}
                            {' '}Upload a new PDF to try again.
                        </p>
                    </div>
                </div>
            )}

            {resume.status === 'parsed' && resume.parsedData && (
                isEditing ? (
                    <ResumeEditForm
                        data={resume.parsedData}
                        onCancel={() => setIsEditing(false)}
                        onSave={handleSave}
                        isSaving={isSaving}
                    />
                ) : (
                    <ResumeSummary data={resume.parsedData} onEdit={() => setIsEditing(true)} />
                )
            )}

            <div className="border-t border-hairline mt-4 pt-3 flex items-center justify-end gap-3">
                {confirmingDelete ? (
                    <>
                        <span className="text-xs text-ink-grey">
                            {isConfirmed ? 'Delete this resume? Its matches will be removed.' : 'Delete this resume?'}
                        </span>
                        <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => {
                                setConfirmingDelete(false);
                                onDelete();
                            }}
                            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                        >
                            Yes, delete
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(false)}
                            className="text-xs font-medium text-ink-grey hover:text-ink"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmingDelete(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-ink-grey hover:text-danger disabled:opacity-50"
                    >
                        <Trash2 className="size-3.5" />
                        {isDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                )}
            </div>
        </div>
    );
}