'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useCountUp } from '@/lib/hooks/useCountUp';
import { Skeleton } from '@/components/ui/Skeleton';
import { STAGE_HELP, STAGE_LABEL } from '@/components/stats/stages';
import type { PeopleStage, Totals } from '@/types/stats';

type FunnelStage = Exclude<PeopleStage, 'parsed'>;

const ORDER: FunnelStage[] = ['scanned', 'matched', 'applied', 'shortlisted', 'rejected'];

// each step is measured against the one before it ("62% of scanned were matched"); shortlisted and rejected both come out of applied
const PARENT: Partial<Record<FunnelStage, FunnelStage>> = {
    matched: 'scanned',
    applied: 'matched',
    shortlisted: 'applied',
    rejected: 'applied',
};

const BAR: Record<FunnelStage, string> = {
    scanned: 'bg-accent/40',
    matched: 'bg-accent/70',
    applied: 'bg-accent',
    shortlisted: 'bg-success',
    rejected: 'bg-danger',
};

function Row({
    stage,
    value,
    base,
    parentValue,
    onOpen,
}: {
    stage: FunnelStage;
    value: number;
    base: number;
    parentValue: number | null;
    onOpen?: () => void;
}) {
    const [grown, setGrown] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setGrown(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const counted = useCountUp(value);
    const width = base > 0 ? Math.max((value / base) * 100, value > 0 ? 2 : 0) : 0;
    const parent = PARENT[stage];
    const step =
        parent && parentValue != null && parentValue > 0 ? `${Math.round((value / parentValue) * 100)}% of ${STAGE_LABEL[parent].toLowerCase()}` : null;

    const content = (
        <>
            <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                    <span className="text-sm font-medium text-ink">{STAGE_LABEL[stage]}</span>
                    <span className="text-xs text-ink-grey ml-2 hidden sm:inline">{STAGE_HELP[stage]}</span>
                </div>
                <div className="flex items-baseline gap-2 shrink-0">
                    {step && <span className="text-xs text-ink-grey">{step}</span>}
                    <span className="font-heading font-bold text-lg text-ink tabular-nums">{(counted ?? 0).toLocaleString()}</span>
                </div>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-hairline-soft overflow-hidden" aria-hidden>
                <div
                    className={cn('h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', BAR[stage])}
                    style={{ width: grown ? `${width}%` : '0%' }}
                />
            </div>
        </>
    );

    if (onOpen && value > 0) {
        return (
            <button
                type="button"
                onClick={onOpen}
                aria-label={`${value.toLocaleString()} ${STAGE_LABEL[stage].toLowerCase()}, view list`}
                className="block w-full text-left rounded-lg px-3 py-2 -mx-3 hover:bg-paper transition-colors cursor-pointer"
            >
                {content}
            </button>
        );
    }
    return <div className="px-3 py-2 -mx-3">{content}</div>;
}

/**
 * The matching funnel as horizontal bars: width = share of everyone scanned, text = the step conversion.
 * `canOpen` says which stages open a list (a company can only open applied / shortlisted / rejected).
 */
export function FunnelBars({
    totals,
    onOpen,
    canOpen = () => true,
    stages = ORDER,
}: {
    totals: Totals | undefined;
    onOpen?: (stage: FunnelStage) => void;
    canOpen?: (stage: FunnelStage) => boolean;
    stages?: FunnelStage[];
}) {
    if (!totals) {
        return (
            <div className="bg-paper-raised border border-hairline rounded-xl p-5 space-y-4" role="status" aria-label="Loading">
                {stages.map((s) => (
                    <div key={s} className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-2.5 w-full" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-5 space-y-2">
            {stages.map((stage) => (
                <Row
                    key={stage}
                    stage={stage}
                    value={totals[stage]}
                    base={totals.scanned}
                    parentValue={PARENT[stage] ? totals[PARENT[stage]!] : null}
                    onOpen={onOpen && canOpen(stage) ? () => onOpen(stage) : undefined}
                />
            ))}
        </div>
    );
}

/** A compact scanned → matched → applied strip for a role card. */
export function MiniFunnel({ scanned, matched, applied }: { scanned: number; matched: number; applied: number }) {
    const rows: { label: string; value: number; bar: string }[] = [
        { label: 'Scanned', value: scanned, bar: 'bg-accent/40' },
        { label: 'Matched', value: matched, bar: 'bg-accent/70' },
        { label: 'Applied', value: applied, bar: 'bg-accent' },
    ];
    return (
        <div className="mt-3 space-y-1.5" role="group" aria-label="Scanned, matched and applied for this role">
            {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-ink-grey">{r.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-hairline-soft overflow-hidden" aria-hidden>
                        <div className={cn('h-full rounded-full', r.bar)} style={{ width: `${scanned > 0 ? Math.max((r.value / scanned) * 100, r.value > 0 ? 3 : 0) : 0}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono tabular-nums text-ink">{r.value.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
}
