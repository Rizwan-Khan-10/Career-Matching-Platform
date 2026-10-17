import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AiBadge } from '@/components/matches/AiBadge';
import type { Match, ShortlistMode } from '@/types/match';

const MODE_LABEL: Record<ShortlistMode, string> = {
    online: 'Online',
    offline: 'In person',
    phone: 'Phone call',
};

const isWebUrl = (value: string) => /^https?:\/\//i.test(value);

function formatWhen(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <dt className="text-xs text-ink-grey">{label}</dt>
            <dd className="text-sm text-ink whitespace-pre-line break-words">{children}</dd>
        </div>
    );
}

export function ShortlistCard({ match }: { match: Match }) {
    const company = match.companyName || 'the company';
    const info = match.shortlistInfo;

    return (
        <div className="mt-3 border-t border-hairline pt-3 space-y-3">
            <p className="text-sm font-medium text-success">You&apos;ve been shortlisted</p>

            {/* the company's own words, shown as written: never edited or filled in by AI */}
            {info && (
                <div className="border border-hairline rounded-lg p-3 bg-paper">
                    <p className="text-xs text-ink-grey mb-2">Details from {company}, exactly as they wrote them</p>
                    <dl className="space-y-2">
                        <Detail label="Round">{info.roundName}</Detail>
                        <Detail label="Mode">{MODE_LABEL[info.mode] ?? info.mode}</Detail>
                        {info.scheduledAt && <Detail label="When">{formatWhen(info.scheduledAt)}</Detail>}
                        {info.link && (
                            <Detail label="Link">
                                {isWebUrl(info.link) ? (
                                    <a
                                        href={info.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent underline underline-offset-2"
                                    >
                                        {info.link}
                                    </a>
                                ) : (
                                    info.link
                                )}
                            </Detail>
                        )}
                        {info.address && <Detail label="Address">{info.address}</Detail>}
                        {info.bring && <Detail label="Bring / prepare">{info.bring}</Detail>}
                        {info.note && <Detail label="Note">{info.note}</Detail>}
                    </dl>
                </div>
            )}

            {/* separate section: AI written, general guidance only */}
            <div className="border border-hairline rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-medium text-ink">AI prep tips</p>
                    <AiBadge />
                </div>
                {match.prepGuide ? (
                    <>
                        <p className="text-sm text-ink whitespace-pre-line">{match.prepGuide}</p>
                        <p className="text-xs text-ink-grey mt-2">General guidance. The company&apos;s details above are what counts.</p>
                    </>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-ink-grey">
                        <Loader2 className="size-3.5 animate-spin" />
                        Preparing your tips — they will show up here shortly.
                    </p>
                )}
            </div>
        </div>
    );
}