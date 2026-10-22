'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { ACADEMIC_LABELS, type AcademicField } from '@/lib/academic';
import { ScoreBadge } from '@/components/matches/ScoreBadge';
import { plainReason } from '@/lib/matchReason';
import { DecisionSummary } from '@/components/matches/DecisionSummary';
import type { ApplicantSummary, Match } from '@/types/match';

const pill = 'text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey transition-colors disabled:opacity-50';

export function CandidateCard({
    match,
    person,
    busy,
    isOpeningPdf,
    onOpenPdf,
    onShortlist,
    onReject,
    onClear,
}: {
    match: Match;
    person?: ApplicantSummary;
    busy: boolean;
    isOpeningPdf: boolean;
    onOpenPdf: () => void;
    onShortlist: () => void;
    onReject: () => void;
    onClear: () => Promise<void>; // handles its own errors
}) {
    const [confirmingClear, setConfirmingClear] = useState(false);
    const decision = match.decision ?? null;
    const unverified = (match.unverifiedRules ?? []).filter((r): r is AcademicField => r in ACADEMIC_LABELS);

    const badge =
        decision === 'shortlisted'
            ? { label: 'Shortlisted', className: 'text-success bg-success-soft' }
            : decision === 'rejected'
              ? { label: 'Rejected', className: 'text-danger bg-danger-soft' }
              : { label: 'Awaiting decision', className: 'text-accent bg-accent-soft' };

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                        {person?.name || 'Unnamed applicant'}
                    </p>
                    {(person?.headline || person?.location) && (
                        <p className="text-xs text-ink-grey truncate">
                            {[person?.headline, person?.location].filter(Boolean).join(' · ')}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-xs font-medium px-2 py-1 rounded-full', badge.className)}>{badge.label}</span>
                    <ScoreBadge score={match.score} />
                </div>
            </div>

            {(match.resumeTargetLabel || unverified.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {match.resumeTargetLabel && (
                        <span className="bg-paper text-ink border border-hairline text-xs font-medium px-2.5 py-1 rounded-full">
                            Resume for: {match.resumeTargetLabel}
                        </span>
                    )}
                    {unverified.map((rule) => (
                        <span
                            key={rule}
                            title="The applicant's value could not be verified, so this rule was not applied"
                            className="bg-accent-soft text-accent text-xs font-medium px-2.5 py-1 rounded-full"
                        >
                            {ACADEMIC_LABELS[rule]} not verified
                        </span>
                    ))}
                </div>
            )}

            {match.reason && <p className="text-sm text-ink-grey mt-2">{plainReason(match.reason)}</p>}

            {(match.matchedSkills?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {match.matchedSkills!.map((skill) => (
                        <span key={skill} className="bg-success-soft text-success text-xs font-medium px-2 py-0.5 rounded-full">
                            {skill}
                        </span>
                    ))}
                </div>
            )}
            {(match.missingSkills?.length ?? 0) > 0 && (
                <p className="text-xs text-ink-grey mt-2">Missing: {match.missingSkills!.join(', ')}</p>
            )}

            <DecisionSummary match={match} />

            <div className="flex flex-wrap items-center gap-2 mt-3">
                {match.resumeStatus === 'ready' && match.resumeId ? (
                    <button
                        type="button"
                        disabled={isOpeningPdf}
                        onClick={onOpenPdf}
                        className="text-xs font-medium px-3 py-1.5 rounded-full bg-accent text-white disabled:opacity-50"
                    >
                        Download resume (PDF)
                    </button>
                ) : match.resumeStatus === 'failed' ? (
                    <span className="text-xs text-danger">Resume could not be prepared — ask the applicant to upload a PDF</span>
                ) : (
                    <span className="text-xs text-ink-grey">Preparing resume PDF…</span>
                )}

                {decision === null ? (
                    <>
                        <button type="button" disabled={busy} onClick={onShortlist} className={cn(pill, 'hover:text-success hover:border-success')}>
                            Shortlist
                        </button>
                        <button type="button" disabled={busy} onClick={onReject} className={cn(pill, 'hover:text-danger hover:border-danger')}>
                            Reject
                        </button>
                    </>
                ) : confirmingClear ? (
                    <>
                        <span className="text-xs text-ink-grey">Clear this decision? The candidate was already notified.</span>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                                await onClear();
                                setConfirmingClear(false);
                            }}
                            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                        >
                            Yes, clear
                        </button>
                        <button type="button" onClick={() => setConfirmingClear(false)} className="text-xs font-medium text-ink-grey hover:text-ink">
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={decision === 'shortlisted' ? onShortlist : onReject}
                            className={cn(pill, 'hover:text-ink')}
                        >
                            Edit details
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirmingClear(true)} className={cn(pill, 'hover:text-danger')}>
                            Clear decision
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}