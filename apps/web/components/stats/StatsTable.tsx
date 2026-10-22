import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { StageCount } from '@/components/stats/StageCount';
import { STAGE_HELP, STAGE_LABEL } from '@/components/stats/stages';
import type { PeopleStage } from '@/types/stats';

export interface StatsColumn<T> {
    key: string;
    header: string;
    /** shown as a tooltip on the header (hover) */
    title?: string;
    align?: 'left' | 'right';
    cell: (row: T) => ReactNode;
    /** the cell of the Total row; leave out for a column that cannot be added up */
    total?: (rows: T[]) => ReactNode;
}

/** The five funnel numbers every stats table shares. */
export interface StageNumbers {
    scanned: number;
    matched: number;
    applied: number;
    shortlisted: number;
    rejected?: number;
}

const STAGES = ['scanned', 'matched', 'applied', 'shortlisted', 'rejected'] as const;

/** Scanned / Matched / Applied / Shortlisted / Rejected columns with clickable counts and a summed Total row. */
export function stageColumns<T extends StageNumbers>(onOpen?: (row: T, stage: PeopleStage) => void): StatsColumn<T>[] {
    return STAGES.map((stage) => ({
        key: stage,
        header: STAGE_LABEL[stage],
        title: STAGE_HELP[stage],
        align: 'right' as const,
        cell: (row: T) =>
            onOpen ? (
                <StageCount value={row[stage] ?? 0} stage={stage} onOpen={() => onOpen(row, stage)} />
            ) : (
                <span className={cn('font-mono tabular-nums', !(row[stage] ?? 0) && 'text-ink-grey')}>{(row[stage] ?? 0).toLocaleString()}</span>
            ),
        total: (rows: T[]) => {
            const sum = rows.reduce((acc, r) => acc + (r[stage] ?? 0), 0);
            return <span className={cn('font-mono tabular-nums', sum === 0 && 'text-ink-grey')}>{sum.toLocaleString()}</span>;
        },
    }));
}

/**
 * One table for every stats list: sticky header, row hover, right-aligned tabular numbers and a Total row.
 * It scrolls sideways only when the screen is narrower than the table.
 */
export function StatsTable<T>({
    rows,
    columns,
    getKey,
    totalLabel = 'Total',
    showTotal = true,
    caption,
}: {
    rows: T[];
    columns: StatsColumn<T>[];
    getKey: (row: T) => string;
    totalLabel?: string;
    showTotal?: boolean;
    caption: string;
}) {
    const hasTotal = showTotal && columns.some((c) => c.total);
    const pad = (i: number) => (i === 0 ? 'pl-4 pr-3' : i === columns.length - 1 ? 'pl-3 pr-4' : 'px-3');

    return (
        <div className="stats-scroll bg-paper-raised border border-hairline rounded-xl overflow-auto max-h-[32rem]">
            <table className="w-full text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="text-xs text-ink-grey border-b border-hairline">
                        {columns.map((col, i) => (
                            <th
                                key={col.key}
                                scope="col"
                                title={col.title}
                                className={cn('py-2.5 font-medium whitespace-nowrap', pad(i), col.align === 'right' ? 'text-right' : 'text-left')}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={getKey(row)} className="border-b border-hairline hover:bg-paper transition-colors">
                            {columns.map((col, i) => (
                                <td key={col.key} className={cn('py-2.5', pad(i), col.align === 'right' ? 'text-right' : 'text-left')}>
                                    {col.cell(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {hasTotal && (
                        <tr className="bg-paper font-medium">
                            {columns.map((col, i) => (
                                <td key={col.key} className={cn('py-2.5', pad(i), col.align === 'right' ? 'text-right' : 'text-left')}>
                                    {i === 0 ? totalLabel : col.total ? col.total(rows) : null}
                                </td>
                            ))}
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

/** One line under a table title that says what the columns mean. */
export function StageLegend({ stages = ['scanned', 'matched', 'applied', 'shortlisted', 'rejected'] }: { stages?: PeopleStage[] }) {
    return (
        <p className="text-xs text-ink-grey mb-2">
            {stages.map((s, i) => (
                <span key={s}>
                    {i > 0 && ' · '}
                    <span className="text-ink">{STAGE_LABEL[s]}</span> = {STAGE_HELP[s].charAt(0).toLowerCase() + STAGE_HELP[s].slice(1)}
                </span>
            ))}
        </p>
    );
}
