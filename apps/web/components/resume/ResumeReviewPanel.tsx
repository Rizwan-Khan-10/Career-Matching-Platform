'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AcademicDetails } from '@/components/resume/AcademicDetails';
import { useApplicantProfile } from '@/lib/hooks/useApplicantProfile';
import { ACADEMIC_FIELDS, ACADEMIC_LABELS, effectiveAcademic } from '@/lib/academic';
import type { Resume } from '@/types/resume';
import { Skeleton } from '@/components/ui/Skeleton';

const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function ResumeReviewPanel({
    resume,
    replaces,
    onConfirm,
    isConfirming,
    onOpenProfile,
}: {
    resume: Resume;
    replaces?: Resume;
    onConfirm: () => void;
    isConfirming: boolean;
    onOpenProfile: () => void;
}) {
    const [agreed, setAgreed] = useState(false);
    const { data: profile, isLoading } = useApplicantProfile();

    const effective = effectiveAcademic(profile, resume.parsedData);
    const missing = ACADEMIC_FIELDS.filter((f) => effective[f].source === 'unknown');
    const noSkills = (resume.parsedData?.skills?.length ?? 0) === 0;

    return (
        <div className="mt-5 border border-accent/20 bg-accent-soft/40 rounded-xl p-4 space-y-4">
            <div>
                <p className="text-sm font-medium text-ink">Review and confirm</p>
                <p className="text-xs text-ink-grey mt-0.5">
                    Check the details above and your academic details below. Only a confirmed resume is matched with roles.
                </p>
            </div>

            {isLoading ? (
                <Skeleton className="h-24" />
            ) : (
                <AcademicDetails effective={effective} onFill={onOpenProfile} />
            )}

            {!isLoading && missing.length > 0 && (
                <p className="text-xs text-ink-grey">
                    Missing: {missing.map((f) => ACADEMIC_LABELS[f]).join(', ')}. Add them with Edit above if they are on your
                    resume, or in your{' '}
                    <button type="button" onClick={onOpenProfile} className="font-medium text-accent hover:underline">
                        profile
                    </button>
                    . Roles with a rule on these still match you, but are flagged as not verified.
                </p>
            )}

            {replaces && (
                <p className="text-xs text-ink">
                    Confirming replaces your current <span className="font-medium">{replaces.targetLabel}</span> resume from{' '}
                    {fmt(replaces.createdAt)}.
                </p>
            )}

            {noSkills && <p className="text-xs text-danger">Add at least one skill (Edit above) before confirming.</p>}

            <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
                <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 size-4 accent-accent"
                />
                These details are correct
            </label>

            <Button disabled={!agreed || noSkills || isConfirming} onClick={onConfirm} className="w-full">
                {isConfirming ? 'Confirming…' : 'Confirm resume'}
            </Button>
        </div>
    );
}