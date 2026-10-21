'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

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
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

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
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        initial={{ x: 48, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 48, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-paper-raised border-l border-hairline shadow-xl w-full md:max-w-xl h-full flex flex-col"
                    >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
                            <h2 className="font-heading text-lg text-ink truncate">{title}</h2>
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
