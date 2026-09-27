'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { StatusBadge } from '@/components/resume/StatusBadge';
import type { Resume } from '@/types/resume';

export function ResumeHistory({ resumes }: { resumes: Resume[] }) {
    const [isOpen, setIsOpen] = useState(false);
    if (resumes.length === 0) return null;

    return (
        <div className="mt-4">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-ink-grey hover:text-ink transition-colors"
            >
                <ChevronDown className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                Previous uploads ({resumes.length})
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
                        <div className="mt-2 space-y-1.5">
                            {resumes.map((r) => (
                                <div
                                    key={r.id}
                                    className="flex items-center justify-between text-sm px-3.5 py-2.5 rounded-lg bg-paper border border-hairline"
                                >
                                    <span className="text-ink-grey">
                                        {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                    <StatusBadge status={r.status} />
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}