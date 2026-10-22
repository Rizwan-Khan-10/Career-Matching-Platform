'use client';

import { NotificationItem } from '@/components/notifications/NotificationItem';
import { useNotificationList, useOpenNotification } from '@/lib/hooks/useNotifications';
import { Skeleton } from '@/components/ui/Skeleton';

// the list used by both the bell dropdown and the full page: loading / error / empty / items / load more
export function NotificationFeed({
    limit,
    unreadOnly = false,
    enabled = true,
    onOpened,
}: {
    limit: number;
    unreadOnly?: boolean;
    enabled?: boolean;
    onOpened?: () => void;
}) {
    const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotificationList({
        limit,
        unreadOnly,
        enabled,
    });
    const open = useOpenNotification(onOpened);
    const items = data?.pages.flatMap((p) => p.items) ?? [];

    if (enabled && isPending) {
        return (
            <div className="p-4 space-y-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12" />
                ))}
            </div>
        );
    }

    if (isError && items.length === 0) {
        return (
            <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger px-4 py-3">
                <span>Couldn&apos;t load notifications.</span>
                <button type="button" onClick={() => refetch()} className="font-medium underline">
                    Try again
                </button>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <p className="text-sm text-ink-grey px-4 py-6 text-center">
                {unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
            </p>
        );
    }

    return (
        <div>
            <ul>
                {items.map((n) => (
                    <NotificationItem key={n.id} notification={n} onOpen={open} />
                ))}
            </ul>
            {hasNextPage && (
                <div className="p-3 text-center border-t border-hairline">
                    <button
                        type="button"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                        {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                </div>
            )}
        </div>
    );
}