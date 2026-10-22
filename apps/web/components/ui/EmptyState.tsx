import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Icon, one sentence, and the next thing to do. Use instead of a lone grey sentence. */
export function EmptyState({
    icon: Icon,
    title,
    text,
    actionLabel,
    actionHref,
    onAction,
    className,
}: {
    icon: LucideIcon;
    title: string;
    text?: string;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
    className?: string;
}) {
    const actionClass =
        'inline-flex items-center text-sm font-medium px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity';
    return (
        <div
            className={cn(
                'flex flex-col items-center text-center gap-1.5 bg-paper-raised border border-dashed border-hairline rounded-xl px-6 py-10',
                className,
            )}
        >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent mb-1">
                <Icon className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-ink">{title}</p>
            {text && <p className="text-sm text-ink-grey max-w-sm">{text}</p>}
            {actionLabel && actionHref && (
                <Link href={actionHref} className={cn(actionClass, 'mt-3')}>
                    {actionLabel}
                </Link>
            )}
            {actionLabel && !actionHref && onAction && (
                <button type="button" onClick={onAction} className={cn(actionClass, 'mt-3')}>
                    {actionLabel}
                </button>
            )}
        </div>
    );
}
