import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    ({ className, ...props }, ref) => (
        <input
            ref={ref}
            className={cn(
                'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink placeholder:text-ink-grey focus:outline-none focus:border-ink transition-colors',
                className,
            )}
            {...props}
        />
    ),
);
Input.displayName = 'Input';