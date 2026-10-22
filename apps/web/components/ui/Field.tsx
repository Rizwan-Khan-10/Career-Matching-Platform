import type { ReactNode } from 'react';
import { FieldError } from '@/components/ui/FieldError';

/**
 * A real <label> above a field (the hint no longer disappears when you type).
 * The input inside must have the same id: <Field id="email" label="Email"><Input id="email" /></Field>
 */
export function Field({
    id,
    label,
    hint,
    error,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
                {label}
            </label>
            {children}
            {hint && !error && <p className="text-xs text-ink-grey mt-1">{hint}</p>}
            <FieldError message={error} />
        </div>
    );
}
