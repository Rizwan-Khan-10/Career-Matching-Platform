'use client';

import { cn } from '@/lib/cn';
import { STAGE_LABEL } from '@/components/stats/stages';
import type { PeopleStage } from '@/types/stats';

/** A dashboard number that opens the list of people behind it. Zero (or no data) stays plain text. */
export function StageCount({
    value,
    stage,
    onOpen,
    className,
}: {
    value: number | null | undefined;
    stage: PeopleStage;
    onOpen: () => void;
    className?: string;
}) {
    // zero is a real number (muted); a dash means "we do not know"
    if (value == null) return <span className={cn('font-mono tabular-nums text-ink-grey', className)} title="Not available">—</span>;
    if (value === 0) return <span className={cn('font-mono tabular-nums text-ink-grey', className)}>0</span>;
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`${value.toLocaleString()} ${STAGE_LABEL[stage].toLowerCase()}, view list`}
            className={cn('font-mono tabular-nums underline-offset-2 hover:underline hover:text-accent transition-colors cursor-pointer', className)}
        >
            {value.toLocaleString()}
        </button>
    );
}
