// TEMPORARY mock of the notification-service HTTP API (contract 5.3). Deleted with lib/mocks after merge.
// State lives in localStorage per role ('mock-notifications-<ROLE>'); reset: localStorage.removeItem('mock-notifications-APPLICANT')
// Live test from the browser console (you must be logged in):
//   window.mockNotify('shortlisted')   // also: prep_ready, rejected, match_eligible, candidate_ready, ...
// It adds a notification and fires the same websocket events the gateway would (toast + bell + matches refetch).
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import type { AppNotification } from '@/types/notification';
import { errorBody, respond } from './helpers';

type Role = 'ADMIN' | 'COMPANY' | 'APPLICANT';
type Template = Pick<AppNotification, 'type' | 'title' | 'body' | 'data'>;

const TEMPLATES: Record<Role, Template[]> = {
  APPLICANT: [
    { type: 'shortlisted', title: 'You were shortlisted', body: 'Northwind Labs shortlisted you for Java Engineer: Technical round 1.', data: { matchId: 'm2' } },
    { type: 'prep_ready', title: 'Your prep tips are ready', body: 'AI prep tips for Java Engineer are ready.', data: { matchId: 'm2' } },
    { type: 'match_eligible', title: 'You are eligible for Backend Developer', body: 'Acme Tech matched you. Review and approve sharing your resume.', data: { matchId: 'm1' } },
    { type: 'resume_ready', title: 'Review and confirm your resume', body: 'Your resume was read. Check the details and confirm it.', data: {} },
    { type: 'feedback_ready', title: 'Your improvement guide is ready', body: 'See how to get closer to DevOps Engineer roles.', data: {} },
    { type: 'rejected', title: 'Update on Backend Developer', body: 'Zenith Software went ahead with another candidate.', data: { matchId: 'm4' } },
    { type: 'rejection_feedback_ready', title: 'Feedback on your application', body: 'AI feedback for Backend Developer is ready.', data: { matchId: 'm4' } },
  ],
  COMPANY: [
    { type: 'candidate_ready', title: 'A candidate is ready', body: 'Aarav Sharma approved sharing their resume for Backend Developer.', data: { jobRoleId: 'mock-role', matchId: 'mock-c1' } },
    { type: 'roles_ready', title: 'Your roles are ready', body: 'We found 3 roles in your requirement document.', data: {} },
    { type: 'company_status', title: 'Your company was approved', body: 'You can now upload requirement documents.', data: {} },
    { type: 'job_approval', title: 'Your job was approved', body: 'An admin approved your job posting.', data: {} },
  ],
  ADMIN: [],
};

// match events the gateway sends next to the notification (contract 6)
const MATCH_EVENT: Record<string, string> = {
  shortlisted: 'candidate.shortlisted',
  rejected: 'candidate.rejected',
  prep_ready: 'prep.ready',
  rejection_feedback_ready: 'rejection-feedback.ready',
};

const key = (role: Role) => `mock-notifications-${role}`;
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function seed(role: Role): AppNotification[] {
  const templates = TEMPLATES[role];
  if (templates.length === 0) return [];
  // 28 items so that "load more" (cursor pagination) can be tested; the 4 newest are unread
  return Array.from({ length: 28 }, (_, i) => ({
    ...templates[i % templates.length],
    id: `mock-n${i + 1}`,
    createdAt: minutesAgo(5 + i * 90),
    readAt: i < 4 ? null : minutesAgo(i),
  }));
}

function save(role: Role, list: AppNotification[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key(role), JSON.stringify(list));
}

function load(role: Role): AppNotification[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key(role));
  if (raw) {
    try {
      return JSON.parse(raw) as AppNotification[];
    } catch {
      /* fall through to the seed */
    }
  }
  const initial = seed(role);
  save(role, initial);
  return initial;
}

const newestFirst = (a: AppNotification, b: AppNotification) => b.createdAt.localeCompare(a.createdAt);

export function handleNotificationMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (!url.startsWith('/notifications')) return null;
  const role = (useAuthStore.getState().role ?? 'APPLICANT') as Role;
  const list = load(role);

  if (method === 'get' && url === '/notifications/unread-count') {
    return respond(config, 200, { count: list.filter((n) => !n.readAt).length });
  }

  if (method === 'get' && url === '/notifications') {
    const p = (config.params ?? {}) as { limit?: number | string; cursor?: string; unread?: number | string };
    const limit = Math.min(Number(p.limit) || 20, 50);
    let items = [...list].sort(newestFirst);
    if (p.unread) items = items.filter((n) => !n.readAt);
    const start = p.cursor ? items.findIndex((n) => n.id === p.cursor) + 1 : 0;
    const page = items.slice(start, start + limit);
    const hasMore = start + limit < items.length;
    return respond(config, 200, { items: page, nextCursor: hasMore ? page[page.length - 1].id : null });
  }

  if (method === 'patch' && url === '/notifications/read-all') {
    const now = new Date().toISOString();
    save(role, list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    return respond(config, 200, { updated: list.filter((n) => !n.readAt).length });
  }

  const read = /^\/notifications\/([^/]+)\/read$/.exec(url);
  if (method === 'patch' && read) {
    const found = list.find((n) => n.id === read[1]);
    if (!found) return respond(config, 404, errorBody(404, 'Notification not found', 'Not Found'));
    found.readAt = found.readAt ?? new Date().toISOString();
    save(role, list);
    return respond(config, 200, found);
  }

  return null;
}

// dev helper: adds a notification and fires the websocket events locally
if (typeof window !== 'undefined') {
  (window as unknown as { mockNotify?: (type?: string) => void }).mockNotify = (type = 'shortlisted') => {
    const { role, token, userId } = useAuthStore.getState();
    if (!role || !token) return;
    const template = TEMPLATES[role].find((t) => t.type === type) ?? TEMPLATES[role][0];
    if (!template) return;
    const notification: AppNotification = { ...template, id: `mock-live-${Date.now()}`, createdAt: new Date().toISOString(), readAt: null };
    save(role, [notification, ...load(role)]);

    // socket.io-client's internal dispatcher: runs the page's listeners without a real server
    const socket = getSocket(token) as unknown as { emitEvent: (args: unknown[]) => void };
    socket.emitEvent(['notification.created', { userId, notification }]);
    const matchEvent = MATCH_EVENT[template.type];
    if (matchEvent) socket.emitEvent([matchEvent, { matchId: template.data?.matchId }]);
  };
}