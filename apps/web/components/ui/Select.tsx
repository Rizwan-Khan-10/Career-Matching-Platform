import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
    ({ className, children, ...props }, ref) => (
        <select
            ref={ref}
            className={cn(
                'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink',
                className,
            )}
            {...props}
        >
            {children}
        </select>
    ),
);
Select.displayName = 'Select';