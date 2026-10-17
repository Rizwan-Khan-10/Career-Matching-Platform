// TEMPORARY mock of GET /stats/admin, GET /admin/health and GET /admin/audit (contracts 5.2, 5.6).
// Deleted with lib/mocks after merge.
//   localStorage.setItem('mock-health', 'ok' | 'dead')   // dead (default) = some streams have failed messages
//   localStorage.setItem('mock-admin-data', 'off')       // use the real backend instead
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { AuditEntry, SystemHealth } from '@/types/admin';
import type { AdminStats } from '@/types/stats';
import { respond } from './helpers';

const STATS: AdminStats = {
  platform: { applicants: 6, resumesScanned: 42, jobs: 5, stoppedJobs: 1 },
  totals: { scanned: 120, matched: 64, applied: 31, shortlisted: 12, rejected: 7 },
  companies: [
    { companyId: 'mock-cu-3', companyName: 'Zenith Software', jobs: 3, stoppedJobs: 0, scanned: 70, matched: 40, applied: 20, shortlisted: 8, rejected: 4 },
    { companyId: 'mock-cu-4', companyName: 'Orbit Systems', jobs: 2, stoppedJobs: 1, scanned: 50, matched: 24, applied: 11, shortlisted: 4, rejected: 3 },
  ],
  roles: [
    { jobRoleId: 'r1', roleTitle: 'Backend Developer', jobPostingId: 'j1', companyName: 'Zenith Software', scanned: 40, matched: 22, applied: 12, shortlisted: 5, rejected: 2, stopped: false },
    { jobRoleId: 'r2', roleTitle: 'Frontend Developer', jobPostingId: 'j1', companyName: 'Zenith Software', scanned: 30, matched: 18, applied: 8, shortlisted: 3, rejected: 2, stopped: false },
    { jobRoleId: 'r3', roleTitle: 'DevOps Engineer', jobPostingId: 'j2', companyName: 'Orbit Systems', scanned: 50, matched: 24, applied: 11, shortlisted: 4, rejected: 3, stopped: true },
  ],
  byBranch: [
    { branch: 'Computer Science', scanned: 52, matched: 30, applied: 15, shortlisted: 6 },
    { branch: 'Information Technology', scanned: 34, matched: 18, applied: 9, shortlisted: 4 },
    { branch: 'Electronics', scanned: 18, matched: 8, applied: 4, shortlisted: 2 },
    { branch: 'Mechanical, Production', scanned: 10, matched: 4, applied: 2, shortlisted: 0 },
    { branch: '=SUM(1+1)', scanned: 2, matched: 1, applied: 1, shortlisted: 0 }, // CSV export must neutralise this
    { branch: null, scanned: 4, matched: 3, applied: 0, shortlisted: 0 },
  ],
};

const STREAMS = ['resume.uploaded', 'resume.parsed', 'resume.confirmed', 'jd.uploaded', 'jd.extracted', 'match.computed', 'candidate.shortlisted', 'notification.created', 'profile.updated'];

function health(): SystemHealth {
  const dead = window.localStorage.getItem('mock-health') !== 'ok';
  const wobble = Math.floor(Date.now() / 10_000) % 5; // lengths change a little, so Refresh visibly does something
  return {
    streams: STREAMS.map((name, i) => ({
      name,
      length: 120 + i * 37 + wobble,
      deadLength: dead && (name === 'resume.parsed' || name === 'notification.created') ? (name === 'resume.parsed' ? 3 : 1) : 0,
    })),
  };
}

const ACTIONS: { action: string; target: (i: number) => string; meta: (i: number) => Record<string, unknown> | null }[] = [
  { action: 'company.status.changed', target: (i) => `company:mock-cu-${(i % 5) + 1}`, meta: (i) => ({ status: i % 2 ? 'approved' : 'rejected' }) },
  { action: 'user.deactivated', target: (i) => `user:mock-au-${(i % 6) + 1}`, meta: () => null },
  { action: 'user.reactivated', target: (i) => `user:mock-au-${(i % 6) + 1}`, meta: () => null },
  { action: 'users.imported', target: () => 'users', meta: (i) => ({ created: 20 + (i % 7), skipped: i % 3 }) },
  { action: 'settings.updated', target: () => 'settings', meta: (i) => ({ registrationMode: i % 2 ? 'invite_only' : 'domain', allowedDomains: ['college.edu'] }) },
  { action: 'job.approval.changed', target: (i) => `job:mock-job-${(i % 4) + 1}`, meta: (i) => ({ approved: i % 2 === 0, note: i % 2 ? 'Document is unreadable' : null }) },
];

function audit(limit: number): AuditEntry[] {
  return Array.from({ length: Math.min(limit, 120) }, (_, i) => {
    const a = ACTIONS[i % ACTIONS.length];
    return {
      id: `mock-audit-${120 - i}`,
      actorId: i % 4 === 3 ? 'mock-admin-2' : 'mock-admin-1',
      action: a.action,
      target: a.target(i),
      meta: a.meta(i),
      createdAt: new Date(Date.now() - i * 37 * 60_000).toISOString(),
    };
  });
}

export function handleAdminStatsMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (typeof window === 'undefined' || window.localStorage.getItem('mock-admin-data') === 'off') return null;
  if (method !== 'get') return null;

  if (url === '/stats/admin') return respond(config, 200, STATS);
  if (url === '/admin/health') return respond(config, 200, health());
  if (url === '/admin/audit') {
    const limit = Math.min(Number((config.params as { limit?: number } | undefined)?.limit) || 50, 200);
    return respond(config, 200, audit(limit));
  }
  return null;
}