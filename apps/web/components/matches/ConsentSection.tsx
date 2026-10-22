'use client';

import { useState } from 'react';
import type { Match } from '@/types/match';
import { canApprove, isPossibleMatch } from '@/lib/matchReason';

// consent: the company only sees you (and gets your resume) after you approve
export function ConsentSection({
    match,
    busy,
    onDecide,
}: {
    match: Match;
    busy: boolean;
    onDecide: (approved: boolean) => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const company = match.companyName || 'this company';
    const approvable = canApprove(match);
    const possible = isPossibleMatch(match);

    return (
        <>
            {approvable && match.applicantStatus === 'pending' && match.jobStopped && (
                <div className="mt-3 border-t border-hairline pt-3">
                    <p className="text-sm text-ink-grey">This job is no longer accepting applications.</p>
                </div>
            )}

            {approvable && match.applicantStatus === 'pending' && !match.jobStopped && (
                <div className="mt-3 border-t border-hairline pt-3">
                    {possible && (
                        <p className="text-xs text-ink-grey mb-2">
                            This is a possible match, not a confirmed one. If you share your resume, the company will look at it themselves and decide.
                        </p>
                    )}
                    {!confirming ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirming(true)}
                                className="text-sm font-medium px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50"
                            >
                                Approve — share my resume with {company}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onDecide(false)}
                                className="text-sm font-medium text-ink-grey hover:text-ink px-3 py-2 disabled:opacity-50"
                            >
                                Not interested
                            </button>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm text-ink mb-2">
                                Your resume will be sent to <b>{company}</b> as a PDF, and they will see you as a ready candidate. This can&apos;t be undone.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        setConfirming(false);
                                        onDecide(true);
                                    }}
                                    className="text-sm font-medium px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50"
                                >
                                    Yes, share it
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirming(false)}
                                    className="text-sm font-medium text-ink-grey hover:text-ink px-3 py-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {approvable && match.applicantStatus === 'declined' && !match.jobStopped && (
                <div className="mt-3 border-t border-hairline pt-3 flex items-center gap-3">
                    <p className="text-sm text-ink-grey">You said you&apos;re not interested.</p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDecide(true)}
                        className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
                    >
                        Changed your mind? Share my resume
                    </button>
                </div>
            )}

            {match.applicantStatus === 'approved' && (
                <div className="mt-3 border-t border-hairline pt-3">
                    <p className="text-sm font-medium text-success">Approved — shared with {company}</p>
                    {match.resumeStatus === 'ready' && <p className="text-sm text-ink-grey mt-0.5">Your resume was sent to them as a PDF.</p>}
                    {match.resumeStatus === 'none' && <p className="text-sm text-ink-grey mt-0.5">Preparing your resume as a PDF…</p>}
                    {match.resumeStatus === 'failed' && (
                        <div className="mt-1">
                            <p className="text-sm text-danger">
                                We couldn&apos;t turn your resume into a PDF. Try again, or upload your resume as a PDF and approve again.
                            </p>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onDecide(true)}
                                className="text-sm font-medium text-accent hover:underline mt-1 disabled:opacity-50"
                            >
                                Try again
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}