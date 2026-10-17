'use client';

import { cn } from '@/lib/cn';
import {
    ACADEMIC_FIELDS,
    ACADEMIC_LABELS,
    type AcademicSource,
    type EffectiveField,
    type AcademicField,
} from '@/lib/academic';

const SOURCE: Record<AcademicSource, { label: string; className: string }> = {
    verified: { label: 'Verified by institution', className: 'bg-success-soft text-success' },
    resume: { label: 'From resume', className: 'bg-accent-soft text-accent' },
    self: { label: 'Entered by you', className: 'bg-paper text-ink-grey border border-hairline' },
    unknown: { label: 'Missing', className: 'bg-danger-soft text-danger' },
};

export function AcademicDetails({
    effective,
    onFill,
}: {
    effective: Record<AcademicField, EffectiveField>;
    onFill?: () => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-3">
            {ACADEMIC_FIELDS.map((field) => {
                const item = effective[field];
                const source = SOURCE[item.source];
                return (
                    <div key={field} className="bg-paper-raised border border-hairline rounded-lg px-3 py-2.5">
                        <p className="text-xs text-ink-grey">{ACADEMIC_LABELS[field]}</p>
                        <p className="text-sm text-ink mt-0.5">{item.value ?? 'Not found'}</p>
                        <span
                            className={cn(
                                'inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-1.5',
                                source.className,
                            )}
                        >
                            {source.label}
                        </span>
                        {item.source === 'unknown' && onFill && (
                            <button
                                type="button"
                                onClick={onFill}
                                className="block text-xs font-medium text-accent hover:underline mt-1"
                            >
                                Add in profile
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}