'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@/components/resume/StatusBadge';
import { ResumeSummary } from '@/components/resume/ResumeSummary';
import { ResumeEditForm } from '@/components/resume/ResumeEditForm';
import type { Resume } from '@/types/resume';
import type { UpdateResumeValues } from '@/lib/schemas/resume';

export function ResumeCard({
    resume,
    onSave,
    isSaving,
}: {
    resume: Resume;
    onSave: (values: UpdateResumeValues) => void;
    isSaving: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);

    const handleSave = (values: UpdateResumeValues) => {
        onSave(values);
        setIsEditing(false);
    };

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-ink">
                    Resume · {new Date(resume.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <StatusBadge status={resume.status} />
            </div>

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
        </div>
    );
}