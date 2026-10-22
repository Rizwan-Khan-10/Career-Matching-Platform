import { timeAgo } from '@/lib/time';

/** "5 minutes ago" as the text, the full date and time in the tooltip. Renders nothing for an invalid date. */
export function TimeAgo({ iso, className }: { iso: string | null | undefined; className?: string }) {
    if (!iso) return null;
    const text = timeAgo(iso);
    if (!text) return null;
    return (
        <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className}>
            {text}
        </time>
    );
}
