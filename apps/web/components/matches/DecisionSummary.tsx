import { formatWhen, modeLabel, reasonLabel } from '@/lib/decisions';
import type { Match } from '@/types/match';

// what the company decided, as stored (company side only: the private reason is shown here, never to the applicant)
export function DecisionSummary({ match }: { match: Match }) {
    if (match.decision === 'shortlisted' && match.shortlistInfo) {
        const info = match.shortlistInfo;
        const parts = [info.roundName, modeLabel(info.mode), info.scheduledAt ? formatWhen(info.scheduledAt) : null];
        return (
            <div className="mt-3 bg-paper rounded-lg px-3 py-2.5">
                <p className="text-xs text-ink-grey">Sent to the candidate</p>
                <p className="text-sm text-ink">{parts.filter(Boolean).join(' · ')}</p>
            </div>
        );
    }

    if (match.decision === 'rejected') {
        return (
            <div className="mt-3 bg-paper rounded-lg px-3 py-2.5">
                <p className="text-sm text-ink">
                    Reason (private): {match.rejectReason ? reasonLabel(match.rejectReason) : '—'}
                </p>
                <p className="text-xs text-ink-grey mt-0.5 whitespace-pre-line break-words">
                    {match.rejectMessage
                        ? `Candidate sees: “${match.rejectMessage}”`
                        : 'No message written, so the candidate gets a polite default.'}
                </p>
            </div>
        );
    }

    return null;
}