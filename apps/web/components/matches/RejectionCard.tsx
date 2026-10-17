import { AiBadge } from '@/components/matches/AiBadge';
import type { Match } from '@/types/match';

export function RejectionCard({ match }: { match: Match }) {
    const company = match.companyName || 'The company';
    const message = match.rejectionMessage?.trim();

    return (
        <div className="mt-3 border-t border-hairline pt-3 space-y-3">
            <p className="text-sm font-medium text-ink">Not selected for this role</p>

            <div className="border border-hairline rounded-lg p-3 bg-paper">
                <p className="text-xs text-ink-grey mb-1">{message ? `Message from ${company}` : 'Update'}</p>
                <p className="text-sm text-ink whitespace-pre-line break-words">
                    {message || `${company} decided not to move forward with your application this time. Thank you for your interest.`}
                </p>
            </div>

            {match.rejectionFeedback && (
                <div className="border border-hairline rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-ink">AI feedback</p>
                        <AiBadge />
                    </div>
                    <p className="text-sm text-ink whitespace-pre-line">{match.rejectionFeedback}</p>
                </div>
            )}
        </div>
    );
}