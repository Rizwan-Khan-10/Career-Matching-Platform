import { cn } from '@/lib/cn';

export type ScoreBand = 'low' | 'fair' | 'strong';

/** red below 40, amber 40 to 70, green above 70 (the number and the word are always shown, so colour is never the only signal) */
export function scoreBand(percent: number): ScoreBand {
    if (percent < 40) return 'low';
    if (percent <= 70) return 'fair';
    return 'strong';
}

const STYLE: Record<ScoreBand, { label: string; className: string }> = {
    low: { label: 'Low fit', className: 'bg-danger-soft text-danger' },
    fair: { label: 'Fair fit', className: 'bg-warning-soft text-warning' },
    strong: { label: 'Strong fit', className: 'bg-success-soft text-success' },
};

export const SCORE_MEANING = 'How well the resume fits this role';

/** "82% · Strong fit". `score` is 0 to 1 as the API sends it. */
export function ScoreBadge({ score, showLabel = true, className }: { score: number; showLabel?: boolean; className?: string }) {
    const percent = Math.round(score * 100);
    const band = STYLE[scoreBand(percent)];
    return (
        <span
            title={`${SCORE_MEANING}: ${percent}%`}
            className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap', band.className, className)}
        >
            <span className="font-mono tabular-nums">{percent}%</span>
            {showLabel && <span>{band.label}</span>}
        </span>
    );
}
