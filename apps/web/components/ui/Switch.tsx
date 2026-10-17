'use client';

import { cn } from '@/lib/cn';

export function Switch({
    checked,
    onChange,
    label,
    disabled = false,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string; // read out by screen readers
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                checked ? 'bg-accent' : 'bg-hairline',
            )}
        >
            <span
                className={cn(
                    'inline-block size-5 rounded-full bg-white shadow transition-transform',
                    checked ? 'translate-x-[22px]' : 'translate-x-0.5',
                )}
            />
        </button>
    );
}