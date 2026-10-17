// TEMPORARY mock of the auth-service admin endpoints (contract 5.1). Deleted with lib/mocks after merge.
//   GET / PUT /auth/admin/settings      state in localStorage 'mock-admin-settings'
//                                        (saving also sets 'mock-reg-mode', so the signup page follows the mode)
//   POST /auth/admin/users/import        imported emails are kept in 'mock-imported-emails'
// Reset: localStorage.removeItem('mock-admin-settings'); localStorage.removeItem('mock-imported-emails')
// In the import mock, an email starting with "taken" is always skipped (already registered).
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { AdminSettings } from '@/types/admin';
import type { RegistrationMode } from '@/types/auth';
import { bodyOf, errorBody, respond } from './helpers';

const SETTINGS_KEY = 'mock-admin-settings';
const IMPORTED_KEY = 'mock-imported-emails';
const MODES: RegistrationMode[] = ['open', 'invite_only', 'domain'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadSettings(): AdminSettings {
  const mode = typeof window === 'undefined' ? null : window.localStorage.getItem('mock-reg-mode');
  const fallback: AdminSettings = {
    registrationMode: MODES.includes(mode as RegistrationMode) ? (mode as RegistrationMode) : 'open',
    allowedDomains: ['college.edu', 'students.college.edu'],
    companyApprovalRequired: true,
    jobApprovalRequired: false,
  };
  return readJson<AdminSettings>(SETTINGS_KEY, fallback);
}

export function handleAdminMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (url === '/auth/admin/settings' && method === 'get') return respond(config, 200, loadSettings());

  if (url === '/auth/admin/settings' && method === 'put') {
    const body = bodyOf(config);
    const problems: string[] = [];
    if (!MODES.includes(body.registrationMode as RegistrationMode)) problems.push('registrationMode must be one of: open, invite_only, domain');
    if (!Array.isArray(body.allowedDomains) || !body.allowedDomains.every((d) => typeof d === 'string')) problems.push('allowedDomains must be an array of strings');
    if (typeof body.companyApprovalRequired !== 'boolean') problems.push('companyApprovalRequired must be a boolean value');
    if (typeof body.jobApprovalRequired !== 'boolean') problems.push('jobApprovalRequired must be a boolean value');
    if (problems.length > 0) return respond(config, 400, { statusCode: 400, message: problems, error: 'Bad Request' });

    const saved = body as unknown as AdminSettings;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    window.localStorage.setItem('mock-reg-mode', saved.registrationMode);
    return respond(config, 200, saved);
  }

  if (url === '/auth/admin/users/import' && method === 'post') {
    const users = bodyOf(config).users;
    if (!Array.isArray(users) || users.length === 0) {
      return respond(config, 400, { statusCode: 400, message: ['users should not be empty'], error: 'Bad Request' });
    }
    if (users.length > 500) {
      return respond(config, 400, { statusCode: 400, message: ['users must contain no more than 500 elements'], error: 'Bad Request' });
    }

    const known = new Set(readJson<string[]>(IMPORTED_KEY, []));
    const created: { email: string; id: string }[] = [];
    const skipped: { email: string; reason: string }[] = [];
    for (const u of users as { email?: unknown; role?: unknown }[]) {
      const email = typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
      if (!EMAIL.test(email)) skipped.push({ email, reason: 'Email is not valid' });
      else if (u.role !== 'APPLICANT' && u.role !== 'COMPANY') skipped.push({ email, reason: 'Role must be APPLICANT or COMPANY' });
      else if (email.startsWith('taken') || known.has(email)) skipped.push({ email, reason: 'A user with this email already exists' });
      else {
        known.add(email);
        created.push({ email, id: `mock-u-${known.size}` });
      }
    }
    window.localStorage.setItem(IMPORTED_KEY, JSON.stringify([...known]));
    return respond(config, 200, { created, skipped });
  }

  if (url.startsWith('/auth/admin/')) return respond(config, 404, errorBody(404, 'Not found in the mock', 'Not Found'));
  return null;
}