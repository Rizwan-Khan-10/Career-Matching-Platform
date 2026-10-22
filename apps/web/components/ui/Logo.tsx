import { cn } from '@/lib/cn';

/** Small logo mark: two linked nodes (a candidate and a role). Pure SVG, no image file. */
export function LogoMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7 shrink-0', className)} fill="none">
            <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
            <circle cx="10.5" cy="16" r="3.2" fill="#fff" />
            <circle cx="21.5" cy="16" r="3.2" fill="#3FC98A" />
            <path d="M13.7 16h4.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
    return (
        <span className={cn('inline-flex items-center gap-2.5 font-heading font-bold text-lg', light ? 'text-white' : 'text-ink', className)}>
            <LogoMark />
            CareerMatch
        </span>
    );
}
