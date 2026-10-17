import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, BACKEND_PYTHON, javaBackendResume, pythonBackendResume } from '../src/docs';
import { api, ok } from '../src/http';
import { eventually } from '../src/poll';
import { connectSocket, recordEvents } from '../src/socket';
import { newApplicant, uploadResume, waitParsed } from '../src/scenario';

describe('checkpoint 10: the notification bell', () => {
  let socket: Socket | undefined;
  beforeAll(() => applySettings(TEST_DEFAULTS));
  afterAll(() => {
    socket?.disconnect();
  });

  it('pushes notification.created live; unread count, pagination and mark-read work', async () => {
    const applicant = await newApplicant('cp10');
    socket = await connectSocket(applicant.token);
    const events = recordEvents<{ userId: string; notification: { id: string; type: string } }>(socket, 'notification.created');

    // a parsed resume creates a "resume_ready" notification (and the second one gives us two to page through)
    const first = await uploadResume(applicant, javaBackendResume('E2E Bell One'), BACKEND_JAVA);
    await waitParsed(applicant, first.id);
    const live = await eventually('notification.created arrives on the socket', async () =>
      events.find((e) => e.notification?.type === 'resume_ready'),
    );
    expect(live.userId).toBe(applicant.userId);

    const second = await uploadResume(applicant, pythonBackendResume('E2E Bell Two'), BACKEND_PYTHON);
    await waitParsed(applicant, second.id);

    const count = async () => ok(await api('/notifications/unread-count', { token: applicant.token }), 'unread-count').count as number;
    await eventually('two unread notifications', async () => (await count()) >= 2);

    // cursor pagination
    const page1 = ok(await api('/notifications', { token: applicant.token, query: { limit: 1 } }), 'page 1');
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = ok(await api('/notifications', { token: applicant.token, query: { limit: 1, cursor: page1.nextCursor } }), 'page 2');
    expect(page2.items[0].id).not.toBe(page1.items[0].id);

    // mark one as read, then all
    const before = await count();
    ok(await api(`/notifications/${page1.items[0].id}/read`, { method: 'PATCH', token: applicant.token }), 'mark read');
    expect(await count()).toBe(before - 1);
    ok(await api('/notifications/read-all', { method: 'PATCH', token: applicant.token }), 'read-all');
    expect(await count()).toBe(0);
    const unread = ok(await api('/notifications', { token: applicant.token, query: { unread: 1 } }), 'unread list');
    expect(unread.items).toHaveLength(0);
  });
});