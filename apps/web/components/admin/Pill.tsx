import { cn } from '@/lib/cn';

const TONES = {
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    accent: 'bg-accent-soft text-accent',
    warning: 'bg-warning-soft text-warning',
    muted: 'bg-paper text-ink-grey border border-hairline',
} as const;

export function Pill({
    tone,
    title,
    children,
}: {
    tone: keyof typeof TONES;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <span title={title} className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full', TONES[tone])}>
            {children}
        </span>
    );
}