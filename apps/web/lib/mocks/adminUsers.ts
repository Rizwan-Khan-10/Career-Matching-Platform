// TEMPORARY mock of the admin list + action endpoints (contracts 5.1, 5.2, 5.5). Deleted with lib/mocks after merge.
//   GET /admin/companies, GET /admin/applicants
//   PATCH /admin/companies/:userId/status, PATCH /auth/admin/users/:id/active, DELETE /auth/admin/users/:id
//   GET /jobs/admin/pending, PATCH /jobs/admin/:id/approval
// State in localStorage 'mock-admin-users'. Reset: localStorage.removeItem('mock-admin-users')
// Pass through to the real backend instead: localStorage.setItem('mock-admin-data', 'off')
// Deleting "locked@college.edu" fails with 409, to see the error in the dialog.
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { AdminApplicant, AdminCompany, PendingJob } from '@/types/admin';
import type { CompanyStatus } from '@/types/company';
import { bodyOf, errorBody, respond } from './helpers';

const KEY = 'mock-admin-users';
const STATUSES: CompanyStatus[] = ['pending', 'approved', 'rejected'];

interface State {
  companies: AdminCompany[];
  applicants: AdminApplicant[];
  jobs: PendingJob[];
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function company(n: number, name: string, status: CompanyStatus, over: Partial<AdminCompany> = {}): AdminCompany {
  return { id: `mock-co-${n}`, userId: `mock-cu-${n}`, name, email: `hr@${name.split(' ')[0].toLowerCase()}.com`, industry: 'Software', contact: null, status, isActive: true, createdAt: daysAgo(n), ...over };
}

function applicant(n: number, name: string, over: Partial<AdminApplicant> = {}): AdminApplicant {
  return { id: `mock-ap-${n}`, userId: `mock-au-${n}`, name, email: `${name.split(' ')[0].toLowerCase()}@college.edu`, education: 'B.Tech', isActive: true, createdAt: daysAgo(n), ...over };
}

function seed(): State {
  return {
    companies: [
      company(1, 'Northwind Labs', 'pending'),
      company(2, 'Acme Tech', 'pending'),
      company(3, 'Zenith Software', 'approved'),
      company(4, 'Orbit Systems', 'approved', { isActive: false }),
      company(5, 'Delta Dynamics', 'rejected'),
    ],
    applicants: [
      applicant(1, 'Aarav Sharma', { cgpa: 8.4, branch: 'Computer Science', passingYear: 2026, backlogs: 0, academicVerified: true }),
      applicant(2, 'Diya Patil', { cgpa: 7.9, branch: 'Information Technology', passingYear: 2026, backlogs: 1, academicVerified: true }),
      applicant(3, 'Rohan Iyer', { cgpa: 8.1, branch: 'Computer Science', academicVerified: false }),
      applicant(4, 'Sneha Kulkarni'),
      applicant(5, 'Kabir Mehta', { isActive: false, cgpa: 6.8, branch: 'Mechanical', passingYear: 2025, backlogs: 2, academicVerified: true }),
      applicant(6, 'Locked Student', { email: 'locked@college.edu' }),
    ],
    jobs: [
      { id: 'mock-job-1', companyId: 'mock-cu-3', companyName: 'Zenith Software', fileUrl: 'https://example.com/docs/backend-engineer-jd.pdf', createdAt: daysAgo(0), approvalStatus: 'pending' },
      { id: 'mock-job-2', companyId: 'mock-cu-4', companyName: 'Orbit Systems', fileUrl: 'jobs/orbit/2026-10-requirements.docx', createdAt: daysAgo(1), approvalStatus: 'pending' },
    ],
  };
}

const save = (state: State) => window.localStorage.setItem(KEY, JSON.stringify(state));

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* fall through to the seed */
  }
  const initial = seed();
  save(initial);
  return initial;
}

export function handleAdminUsersMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (typeof window === 'undefined' || window.localStorage.getItem('mock-admin-data') === 'off') return null;

  if (method === 'get' && url === '/admin/companies') return respond(config, 200, load().companies);
  if (method === 'get' && url === '/admin/applicants') return respond(config, 200, load().applicants);
  if (method === 'get' && url === '/jobs/admin/pending') return respond(config, 200, load().jobs);

  const status = /^\/admin\/companies\/([^/]+)\/status$/.exec(url);
  if (method === 'patch' && status) {
    const next = bodyOf(config).status;
    if (!STATUSES.includes(next as CompanyStatus)) {
      return respond(config, 400, { statusCode: 400, message: ['status must be one of: pending, approved, rejected'], error: 'Bad Request' });
    }
    const state = load();
    const found = state.companies.find((c) => c.userId === status[1]);
    if (!found) return respond(config, 404, errorBody(404, 'Company not found', 'Not Found'));
    found.status = next as CompanyStatus;
    save(state);
    return respond(config, 200, { userId: found.userId, status: found.status });
  }

  const active = /^\/auth\/admin\/users\/([^/]+)\/active$/.exec(url);
  if (method === 'patch' && active) {
    const value = bodyOf(config).active;
    if (typeof value !== 'boolean') {
      return respond(config, 400, { statusCode: 400, message: ['active must be a boolean value'], error: 'Bad Request' });
    }
    const state = load();
    const found = [...state.companies, ...state.applicants].find((u) => u.userId === active[1]);
    if (!found) return respond(config, 404, errorBody(404, 'User not found', 'Not Found'));
    found.isActive = value;
    save(state);
    return respond(config, 200, { id: found.userId, isActive: value });
  }

  const user = /^\/auth\/admin\/users\/([^/]+)$/.exec(url);
  if (method === 'delete' && user) {
    const state = load();
    const target = [...state.companies, ...state.applicants].find((u) => u.userId === user[1]);
    if (!target) return respond(config, 404, errorBody(404, 'User not found', 'Not Found'));
    if (target.email === 'locked@college.edu') return respond(config, 409, errorBody(409, 'This user cannot be deleted right now', 'Conflict'));
    state.companies = state.companies.filter((c) => c.userId !== user[1]);
    state.applicants = state.applicants.filter((a) => a.userId !== user[1]);
    save(state);
    return respond(config, 200, { deleted: true });
  }

  const approval = /^\/jobs\/admin\/([^/]+)\/approval$/.exec(url);
  if (method === 'patch' && approval) {
    const body = bodyOf(config);
    if (typeof body.approved !== 'boolean') {
      return respond(config, 400, { statusCode: 400, message: ['approved must be a boolean value'], error: 'Bad Request' });
    }
    const state = load();
    if (!state.jobs.some((j) => j.id === approval[1])) return respond(config, 404, errorBody(404, 'Job posting not found', 'Not Found'));
    state.jobs = state.jobs.filter((j) => j.id !== approval[1]); // decided jobs leave the pending list
    save(state);
    return respond(config, 200, { id: approval[1], approvalStatus: body.approved ? 'approved' : 'rejected' });
  }

  return null;
}