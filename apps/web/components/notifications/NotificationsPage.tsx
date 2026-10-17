'use client';

import { useState } from 'react';
import { NotificationFeed } from '@/components/notifications/NotificationFeed';
import { useMarkAllRead, useUnreadCount } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/cn';

// one page for every role (the three route files just render this)
export function NotificationsPage() {
    const [unreadOnly, setUnreadOnly] = useState(false);
    const { data: count = 0 } = useUnreadCount();
    const markAll = useMarkAllRead();

    const tab = (active: boolean) =>
        cn(
            'text-sm font-medium px-3 py-1.5 rounded-lg transition-colors',
            active ? 'bg-accent-soft text-accent' : 'text-ink-grey hover:text-ink',
        );

    return (
        <div className="max-w-2xl">
            <div className="flex items-end justify-between gap-3 mb-1">
                <h1 className="font-heading text-2xl text-ink">Notifications</h1>
                <button
                    type="button"
                    onClick={() => markAll.mutate()}
                    disabled={count === 0 || markAll.isPending}
                    className="text-sm font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
                >
                    Mark all as read
                </button>
            </div>
            <p className="text-sm text-ink-grey mb-4">Updates are kept for 90 days.</p>

            <div className="flex gap-1 mb-3" role="tablist" aria-label="Filter notifications">
                <button type="button" role="tab" aria-selected={!unreadOnly} onClick={() => setUnreadOnly(false)} className={tab(!unreadOnly)}>
                    All
                </button>
                <button type="button" role="tab" aria-selected={unreadOnly} onClick={() => setUnreadOnly(true)} className={tab(unreadOnly)}>
                    Unread{count > 0 ? ` (${count})` : ''}
                </button>
            </div>

            <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
                <NotificationFeed limit={20} unreadOnly={unreadOnly} />
            </div>
        </div>
    );
}