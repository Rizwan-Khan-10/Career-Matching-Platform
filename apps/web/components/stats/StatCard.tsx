'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCountUp } from '@/lib/hooks/useCountUp';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * One big number with a label. `value`: undefined = still loading (skeleton), null = unknown (dash), a number = counted up.
 * Give it `href` to make it a link, or `onOpen` to open the list of people behind the number (only when the number is above 0).
 */
export function StatCard({
    value,
    label,
    hint,
    href,
    onOpen,
    tone = 'default',
}: {
    value: number | string | null | undefined;
    label: string;
    hint?: string;
    href?: string;
    onOpen?: () => void;
    tone?: 'default' | 'success';
}) {
    const counted = useCountUp(typeof value === 'number' ? value : null);
    const loading = value === undefined;
    const shown = typeof value === 'number' ? (counted ?? 0).toLocaleString() : (value ?? '—');
    const openable = !!onOpen && typeof value === 'number' && value > 0;
    const interactive = !!href || openable;

    const body = (
        <div
            className={cn(
                'relative h-full bg-paper-raised border border-hairline rounded-xl p-5 transition-colors',
                interactive && 'hover:border-accent group-hover:border-accent',
            )}
        >
            {interactive && (
                <ArrowUpRight
                    aria-hidden
                    className="absolute right-3.5 top-3.5 size-4 text-ink-grey opacity-60 group-hover:opacity-100 group-hover:text-accent transition-colors"
                />
            )}
            {loading ? (
                <Skeleton className="h-9 w-16" />
            ) : (
                <p className={cn('text-3xl font-heading font-bold tabular-nums', tone === 'success' ? 'text-success' : 'text-ink')}>{shown}</p>
            )}
            <p className="text-sm text-ink mt-1">{label}</p>
            {hint && <p className="text-xs text-ink-grey mt-0.5">{hint}</p>}
        </div>
    );

    if (href) {
        return (
            <Link href={href} className="group block rounded-xl">
                {body}
            </Link>
        );
    }
    if (openable) {
        return (
            <button
                type="button"
                onClick={onOpen}
                aria-label={`${Number(value).toLocaleString()} ${label.toLowerCase()}, view list`}
                className="group block w-full h-full text-left rounded-xl cursor-pointer"
            >
                {body}
            </button>
        );
    }
    return body;
}
