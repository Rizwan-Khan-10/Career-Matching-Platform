'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { notificationHref } from '@/lib/notificationTargets';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/authStore';
import type { AppNotification, NotificationPage } from '@/types/notification';

// keys are scoped by user id, so a second user on the same browser never sees the first user's bell
export const NOTIFICATIONS_KEY = ['notifications'] as const;

export function useUnreadCount() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<number>({
    queryKey: [...NOTIFICATIONS_KEY, userId, 'unread-count'],
    queryFn: () => apiClient.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
    // safety net in case the socket missed an event while the tab was in the background
    refetchOnWindowFocus: true,
  });
}

export function useNotificationList({
  limit,
  unreadOnly = false,
  enabled = true,
}: {
  limit: number;
  unreadOnly?: boolean;
  enabled?: boolean;
}) {
  const userId = useAuthStore((s) => s.userId);
  return useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, userId, 'list', { limit, unreadOnly }],
    queryFn: ({ pageParam }) =>
      apiClient
        .get<NotificationPage>('/notifications', {
          params: { limit, cursor: pageParam ?? undefined, unread: unreadOnly ? 1 : undefined },
        })
        .then((r) => r.data),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

function useRefreshNotifications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
}

export function useMarkRead() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`).then((r) => r.data),
    onSuccess: refresh,
  });
}

export function useMarkAllRead() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all').then((r) => r.data),
    onSuccess: refresh,
    onError: (err) => toast.error(getErrorMessage(err, 'Could not mark all as read, try again')),
  });
}

/** Click on a notification: mark it read, go to its page (contract 7), then let the caller close its UI. */
export function useOpenNotification(onDone?: () => void) {
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const markRead = useMarkRead();
  return (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    router.push(notificationHref(n, role));
    onDone?.();
  };
}