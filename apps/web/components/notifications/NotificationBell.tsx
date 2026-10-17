'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { NotificationFeed } from '@/components/notifications/NotificationFeed';
import { useMarkAllRead, useUnreadCount } from '@/lib/hooks/useNotifications';
import { notificationsPath } from '@/lib/notificationTargets';
import { useAuthStore } from '@/store/authStore';

export function NotificationBell() {
    const role = useAuthStore((s) => s.role);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const { data: count = 0 } = useUnreadCount();
    const markAll = useMarkAllRead();

    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
                aria-expanded={open}
                className="relative p-2 rounded-lg text-ink-grey hover:text-ink hover:bg-paper transition-colors"
            >
                <Bell className="size-[18px]" />
                {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[10px] font-medium leading-4 text-center">
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Notifications"
                    className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-paper-raised border border-hairline rounded-xl shadow-xl z-40 overflow-hidden"
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
                        <h2 className="font-heading text-sm text-ink">Notifications</h2>
                        <button
                            type="button"
                            onClick={() => markAll.mutate()}
                            disabled={count === 0 || markAll.isPending}
                            className="text-xs font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                            Mark all as read
                        </button>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        <NotificationFeed limit={10} enabled={open} onOpened={() => setOpen(false)} />
                    </div>

                    <div className="border-t border-hairline px-4 py-2.5 text-center">
                        <Link
                            href={notificationsPath(role)}
                            onClick={() => setOpen(false)}
                            className="text-xs font-medium text-accent hover:underline"
                        >
                            View all
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}