'use client';

import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useDialogBehavior } from '@/lib/hooks/useDialogBehavior';
import type { NavRole } from '@/lib/navItems';
import { SidebarNav } from './SidebarNav';

/** Fixed sidebar from `lg` up. Below that it is hidden: the Topbar hamburger opens <MobileSidebar /> instead. */
export function Sidebar({ role }: { role: NavRole }) {
    return (
        <aside className="hidden lg:block w-60 shrink-0 bg-paper-raised border-r border-hairline sticky top-0 h-screen">
            <SidebarNav role={role} />
        </aside>
    );
}

/** Slide-in drawer for phones and tablets. Closes on a link click, on Esc, on a tap outside, and when the route changes. */
export function MobileSidebar({ role, open, onClose }: { role: NavRole; open: boolean; onClose: () => void }) {
    const panelRef = useRef<HTMLDivElement>(null);
    useDialogBehavior(open, onClose, panelRef);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm lg:hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu"
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative bg-paper-raised border-r border-hairline shadow-xl w-72 max-w-[85vw] h-full"
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close menu"
                            className="absolute right-3 top-4 p-1.5 rounded-lg text-ink-grey hover:text-ink hover:bg-paper transition-colors"
                        >
                            <X className="size-4" />
                        </button>
                        <SidebarNav role={role} onNavigate={onClose} />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
