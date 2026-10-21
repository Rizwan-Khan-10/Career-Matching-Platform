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
    if (!value) return <span className={cn('font-mono', className)}>{value ?? 0}</span>;
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`${value} ${STAGE_LABEL[stage].toLowerCase()}, view list`}
            className={cn('font-mono underline-offset-2 hover:underline hover:text-accent transition-colors cursor-pointer', className)}
        >
            {value}
        </button>
    );
}
