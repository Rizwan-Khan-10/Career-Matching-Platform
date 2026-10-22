import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';

/** The "Couldn't load X / Try again" box every page used to copy by hand. */
export function ErrorBox({
    message,
    onRetry,
    className,
}: {
    message: string;
    onRetry?: () => void;
    className?: string;
}) {
    return (
        <div
            role="alert"
            className={cn(
                'flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-xl px-4 py-3',
                className,
            )}
        >
            <span className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span>{message}</span>
            </span>
            {onRetry && (
                <button type="button" onClick={onRetry} className="font-medium underline shrink-0">
                    Try again
                </button>
            )}
        </div>
    );
}
