'use client';

import { cn } from '@/lib/cn';
import { Pill } from '@/components/admin/Pill';
import { ScoreBadge } from '@/components/matches/ScoreBadge';
import { isPossibleMatch } from '@/lib/matchReason';
import type { ApplicantSummary, Match } from '@/types/match';

const action = 'text-xs font-medium px-2.5 py-1 rounded-full border border-hairline text-ink-grey transition-colors disabled:opacity-50';

/** The compact alternative to the candidate cards: one row per person, the two decisions one tab-stop away. */
export function CandidateTable({
    matches,
    byId,
    busy,
    isOpeningPdf,
    onOpenPdf,
    onShortlist,
    onReject,
}: {
    matches: Match[];
    byId: Map<string, ApplicantSummary>;
    busy: boolean;
    isOpeningPdf: boolean;
    onOpenPdf: (match: Match) => void;
    onShortlist: (match: Match) => void;
    onReject: (match: Match) => void;
}) {
    return (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="sr-only">Candidates who approved sharing their resume</caption>
                <thead>
                    <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                        <th scope="col" className="pl-4 pr-3 py-2.5 font-medium">Candidate</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">Fit</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">Resume</th>
                        <th scope="col" className="pl-3 pr-4 py-2.5 font-medium text-right">Decision</th>
                    </tr>
                </thead>
                <tbody>
                    {matches.map((m) => {
                        const person = byId.get(m.applicantId);
                        const name = person?.name || 'Unnamed applicant';
                        const decision = m.decision ?? null;
                        return (
                            <tr key={m.id} className="border-b border-hairline last:border-0 hover:bg-paper transition-colors">
                                <td className="pl-4 pr-3 py-2.5">
                                    <p className="text-ink font-medium">
                                        {name}
                                        {isPossibleMatch(m) && (
                                            <span className="ml-2 align-middle text-xs font-medium px-2 py-0.5 rounded-full bg-warning-soft text-warning" title="Below the automatic bar but close: review the resume yourself">
                                                Possible match
                                            </span>
                                        )}
                                    </p>
                                    {person?.headline && <p className="text-xs text-ink-grey truncate max-w-56">{person.headline}</p>}
                                </td>
                                <td className="px-3 py-2.5"><ScoreBadge score={m.score} showLabel={false} /></td>
                                <td className="px-3 py-2.5">
                                    <Pill tone={decision === 'shortlisted' ? 'success' : decision === 'rejected' ? 'danger' : 'accent'}>
                                        {decision === 'shortlisted' ? 'Shortlisted' : decision === 'rejected' ? 'Rejected' : 'Awaiting decision'}
                                    </Pill>
                                </td>
                                <td className="px-3 py-2.5">
                                    {m.resumeStatus === 'ready' && m.resumeId ? (
                                        <button
                                            type="button"
                                            disabled={isOpeningPdf}
                                            onClick={() => onOpenPdf(m)}
                                            className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                                        >
                                            Download PDF
                                        </button>
                                    ) : m.resumeStatus === 'failed' ? (
                                        <span className="text-xs text-danger">Failed</span>
                                    ) : (
                                        <span className="text-xs text-ink-grey">Preparing…</span>
                                    )}
                                </td>
                                <td className="pl-3 pr-4 py-2.5">
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onShortlist(m)}
                                            aria-label={`${decision === 'shortlisted' ? 'Edit shortlist for' : 'Shortlist'} ${name}`}
                                            className={cn(action, 'hover:text-success hover:border-success', decision === 'shortlisted' && 'text-success border-success')}
                                        >
                                            {decision === 'shortlisted' ? 'Edit' : 'Shortlist'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onReject(m)}
                                            aria-label={`${decision === 'rejected' ? 'Edit rejection for' : 'Reject'} ${name}`}
                                            className={cn(action, 'hover:text-danger hover:border-danger', decision === 'rejected' && 'text-danger border-danger')}
                                        >
                                            {decision === 'rejected' ? 'Edit' : 'Reject'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
