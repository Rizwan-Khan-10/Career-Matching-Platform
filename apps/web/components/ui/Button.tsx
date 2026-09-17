import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ className, ...props }, ref) => (
        <button
            ref={ref}
            className={cn(
                'bg-accent text-white font-body font-medium text-sm px-4 py-2.5 rounded-lg shadow-[0_4px_14px_rgba(52,84,209,0.3)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed',
                className,
            )}
            {...props}
        />
    ),
);
Button.displayName = 'Button';