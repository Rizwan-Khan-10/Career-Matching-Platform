import { cn } from '@/lib/cn';
import { TimeAgo } from '@/components/ui/TimeAgo';
import type { AppNotification } from '@/types/notification';

export function NotificationItem({
    notification,
    onOpen,
}: {
    notification: AppNotification;
    onOpen: (n: AppNotification) => void;
}) {
    const unread = !notification.readAt;
    return (
        <li className="border-b border-hairline last:border-0">
            <button
                type="button"
                onClick={() => onOpen(notification)}
                className={cn(
                    'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-paper',
                    unread && 'bg-accent-soft/40',
                )}
            >
                <span aria-hidden className={cn('mt-1.5 size-2 rounded-full shrink-0', unread ? 'bg-accent' : 'bg-transparent')} />
                <span className="min-w-0 flex-1">
                    {unread && <span className="sr-only">Unread: </span>}
                    <span className="block text-sm font-medium text-ink">{notification.title}</span>
                    <span className="block text-xs text-ink-grey mt-0.5 line-clamp-2 break-words">{notification.body}</span>
                    <TimeAgo iso={notification.createdAt} className="block text-xs text-ink-grey mt-1" />
                </span>
            </button>
        </li>
    );
}