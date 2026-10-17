'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { Resume } from '@/types/resume';

const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Replaced resumes that are still stored because an approved match uses them. */
export function ResumeHistory({ resumes }: { resumes: Resume[] }) {
    const [isOpen, setIsOpen] = useState(false);
    if (resumes.length === 0) return null;

    return (
        <div className="mt-6">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-ink-grey hover:text-ink transition-colors"
            >
                <ChevronDown className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                Replaced resumes ({resumes.length})
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <p className="text-xs text-ink-grey mt-2">
                            These were replaced by a newer resume, but are kept because a company you approved still uses them.
                        </p>
                        <div className="mt-2 space-y-1.5">
                            {resumes.map((r) => (
                                <div
                                    key={r.id}
                                    className="flex items-center justify-between gap-3 text-sm px-3.5 py-2.5 rounded-lg bg-paper border border-hairline"
                                >
                                    <span className="text-ink truncate">{r.targetLabel || 'Resume'}</span>
                                    <span className="text-xs text-ink-grey shrink-0">
                                        Replaced {r.supersededAt ? fmt(r.supersededAt) : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}