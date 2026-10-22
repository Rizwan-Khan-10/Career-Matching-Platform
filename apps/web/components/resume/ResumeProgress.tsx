import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/** uploaded → reading → ready, shown while a resume is being parsed. The websocket flips it to the full card by itself. */
export function ResumeProgress() {
    const steps = [
        { label: 'Uploaded', state: 'done' },
        { label: 'Reading your resume', state: 'active' },
        { label: 'Ready to review', state: 'todo' },
    ] as const;

    return (
        <div role="status" aria-label="Your resume is being processed">
            <ol className="flex items-center gap-2">
                {steps.map((step, i) => (
                    <li key={step.label} className="flex items-center gap-2 min-w-0">
                        <span
                            className={cn(
                                'flex size-5 shrink-0 items-center justify-center rounded-full',
                                step.state === 'done' && 'bg-success text-white',
                                step.state === 'active' && 'bg-accent-soft text-accent',
                                step.state === 'todo' && 'bg-hairline-soft border border-hairline',
                            )}
                        >
                            {step.state === 'done' && <Check className="size-3" aria-hidden />}
                            {step.state === 'active' && <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
                        </span>
                        <span className={cn('text-xs', step.state === 'todo' ? 'text-ink-grey' : 'text-ink font-medium')}>{step.label}</span>
                        {i < steps.length - 1 && <span aria-hidden className="h-px w-4 sm:w-8 bg-hairline shrink-0" />}
                    </li>
                ))}
            </ol>
            <p className="text-sm text-ink-grey mt-2">Skills, education and projects will show up here shortly.</p>
        </div>
    );
}
