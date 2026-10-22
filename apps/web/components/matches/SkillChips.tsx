import { Check, Minus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SkillKind = 'matched' | 'partial' | 'missing';

// colour AND an icon AND the group label say what a chip means, so nothing relies on colour alone
const KIND: Record<SkillKind, { className: string; icon: typeof Check; sr: string }> = {
    matched: { className: 'bg-success-soft text-success', icon: Check, sr: 'You have' },
    partial: { className: 'bg-warning-soft text-warning', icon: Minus, sr: 'Related experience' },
    missing: { className: 'bg-hairline-soft text-ink border border-hairline', icon: X, sr: 'Missing' },
};

export function SkillChips({
    label,
    skills,
    kind,
    className,
}: {
    label: string;
    skills?: string[];
    kind: SkillKind;
    className?: string;
}) {
    if (!skills || skills.length === 0) return null;
    const { className: tone, icon: Icon, sr } = KIND[kind];
    return (
        <div className="mt-2">
            <p className="text-xs text-ink-grey mb-1">{label}</p>
            <ul className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                    <li key={skill} className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', tone, className)}>
                        <Icon className="size-3" aria-hidden />
                        <span className="sr-only">{sr}: </span>
                        {skill}
                    </li>
                ))}
            </ul>
        </div>
    );
}
