import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    ({ className, ...props }, ref) => (
        <div className="group relative">
            <input
                ref={ref}
                className={cn(
                    'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink placeholder:text-ink-grey outline-none transition-colors focus:border-ink',
                    className,
                )}
                {...props}
            />
            <span className="pointer-events-none absolute left-1/2 bottom-0 h-[1.5px] w-0 -translate-x-1/2 bg-accent transition-all duration-300 ease-out group-focus-within:w-full" />
        </div>
    ),
);
Input.displayName = 'Input';