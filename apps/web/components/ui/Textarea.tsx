import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className, ...props }, ref) => (
        <textarea
            ref={ref}
            rows={3}
            className={cn(
                'w-full border border-hairline bg-paper-raised rounded px-3 py-2.5 text-sm font-body text-ink placeholder:text-ink-grey outline-none transition-colors focus:border-ink resize-y',
                className,
            )}
            {...props}
        />
    ),
);
Textarea.displayName = 'Textarea';