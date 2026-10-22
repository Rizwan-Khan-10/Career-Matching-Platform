'use client';

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useDialogBehavior } from '@/lib/hooks/useDialogBehavior';

/** Right-side panel (full screen on a phone). Same look and Esc / backdrop behaviour as ui/Modal. */
export function DrawerShell({
    isOpen,
    onClose,
    title,
    actions,
    children,
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    const titleId = useId();
    const panelRef = useRef<HTMLElement>(null);
    useDialogBehavior(isOpen, onClose, panelRef);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex justify-end"
                    onClick={onClose}
                >
                    <motion.aside
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-paper-raised border-l border-hairline shadow-xl w-full md:max-w-xl h-full flex flex-col"
                    >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
                            <h2 id={titleId} className="font-heading text-lg text-ink truncate">{title}</h2>
                            <div className="flex items-center gap-3 shrink-0">
                                {actions}
                                <button type="button" onClick={onClose} className="text-ink-grey hover:text-ink transition-colors" aria-label="Close">
                                    <X className="size-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">{children}</div>
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
