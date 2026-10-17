import { Sparkles } from 'lucide-react';

export function AiBadge() {
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent">
            <Sparkles className="size-3" />
            AI generated
        </span>
    );
}