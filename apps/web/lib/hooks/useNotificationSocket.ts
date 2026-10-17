'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';
import { notificationHref } from '@/lib/notificationTargets';
import { NOTIFICATIONS_KEY } from '@/lib/hooks/useNotifications';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/authStore';
import type { NotificationCreatedEvent } from '@/types/notification';

// contract 6: events that change what the applicant's Matches page shows
const MATCH_EVENTS = ['candidate.shortlisted', 'candidate.rejected', 'prep.ready', 'rejection-feedback.ready'];

/** Mounted once in the Topbar (so on every page of every role): live bell + toast + matches refresh. */
export function useNotificationSocket() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const timers: ReturnType<typeof setTimeout>[] = [];

    const refreshNotifications = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

    // 'all': also refetch the Matches cache when that page is not open (global defaults never refetch on mount)
    const refreshMatches = () => {
      const run = () => queryClient.invalidateQueries({ queryKey: ['matches'], refetchType: 'all' });
      run();
      timers.push(setTimeout(run, 1500)); // the event can arrive before the DB write is visible
    };

    const onCreated = (event: NotificationCreatedEvent) => {
      refreshNotifications();
      const n = event?.notification;
      if (!n) return;
      toast(n.title, {
        description: n.body,
        action: {
          label: 'View',
          onClick: () => {
            apiClient.patch(`/notifications/${n.id}/read`).then(refreshNotifications).catch(() => undefined);
            router.push(notificationHref(n, role));
          },
        },
      });
    };

    socket.on('notification.created', onCreated);
    MATCH_EVENTS.forEach((event) => socket.on(event, refreshMatches));
    socket.on('connect', refreshNotifications); // catch up on anything missed while disconnected

    return () => {
      socket.off('notification.created', onCreated);
      MATCH_EVENTS.forEach((event) => socket.off(event, refreshMatches));
      socket.off('connect', refreshNotifications);
      timers.forEach(clearTimeout);
    };
  }, [token, role, queryClient, router]);
}