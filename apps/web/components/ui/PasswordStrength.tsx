import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/cn';

// the server accepts 8 to 72 characters (lib/schemas/auth.ts); the rest is advice, not a rule
const MIN = 8;
const MAX = 72;

function score(password: string) {
    if (!password) return 0;
    let points = 0;
    if (password.length >= MIN) points++;
    if (password.length >= 12) points++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) points++;
    if (password.length < MIN) return Math.min(points, 1);
    return Math.max(points, 1);
}

const LEVELS = [
    { label: 'Too short', bar: 'bg-danger' },
    { label: 'Weak', bar: 'bg-danger' },
    { label: 'Fair', bar: 'bg-warning' },
    { label: 'Good', bar: 'bg-success' },
    { label: 'Strong', bar: 'bg-success' },
];

/** Strength bar with text (never colour alone) and the live rules under a password field. */
export function PasswordStrength({ password }: { password: string }) {
    if (!password) {
        return <p className="text-xs text-ink-grey mt-1.5">Use {MIN} or more characters. Longer is stronger.</p>;
    }
    const points = score(password);
    const level = password.length < MIN ? LEVELS[0] : LEVELS[points];
    const rules = [
        { ok: password.length >= MIN && password.length <= MAX, text: `${MIN}–${MAX} characters` },
        { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), text: 'Upper and lower case (recommended)' },
        { ok: /\d/.test(password), text: 'A number (recommended)' },
    ];

    return (
        <div className="mt-2" aria-live="polite">
            <div className="flex items-center gap-3">
                <div className="flex flex-1 gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((n) => (
                        <span
                            key={n}
                            className={cn(
                                'h-1.5 flex-1 rounded-full transition-colors duration-200',
                                n <= points && password.length >= MIN ? level.bar : 'bg-hairline',
                            )}
                        />
                    ))}
                </div>
                <span className="text-xs font-medium text-ink w-16 text-right">{level.label}</span>
            </div>
            <ul className="mt-2 space-y-0.5">
                {rules.map((rule) => (
                    <li key={rule.text} className={cn('flex items-center gap-1.5 text-xs', rule.ok ? 'text-success' : 'text-ink-grey')}>
                        {rule.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                        <span>
                            {rule.text}
                            <span className="sr-only">{rule.ok ? ' (done)' : ' (not yet)'}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
