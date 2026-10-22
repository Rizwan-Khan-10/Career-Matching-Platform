import { cn } from '@/lib/cn';

/** A shimmering placeholder block. Give it a size with className, e.g. <Skeleton className="h-4 w-32" />. */
export function Skeleton({ className }: { className?: string }) {
    return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

/** One card-shaped placeholder (title line, two text lines). */
export function CardSkeleton({ className }: { className?: string }) {
    return (
        <div aria-hidden className={cn('bg-paper-raised border border-hairline rounded-xl p-4 space-y-3', className)}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
        </div>
    );
}

/** A stack of card placeholders for a list page. */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
    return (
        <div role="status" aria-label="Loading" className={cn('flex flex-col gap-3', className)}>
            {Array.from({ length: rows }, (_, i) => (
                <CardSkeleton key={i} />
            ))}
            <span className="sr-only">Loading…</span>
        </div>
    );
}

/** A table-shaped placeholder: header strip plus rows. */
export function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
    return (
        <div
            role="status"
            aria-label="Loading"
            className={cn('bg-paper-raised border border-hairline rounded-xl overflow-hidden', className)}
        >
            <div className="px-4 py-3 border-b border-hairline">
                <Skeleton className="h-3 w-24" />
            </div>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-hairline last:border-0">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-10 ml-auto" />
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-10" />
                </div>
            ))}
            <span className="sr-only">Loading…</span>
        </div>
    );
}
