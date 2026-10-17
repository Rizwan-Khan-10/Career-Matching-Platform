// TEMPORARY (Task 4.1): contract-shaped fake responses until the backends are merged.
// After merge: delete this folder and the `adapter` line in lib/apiClient.ts.
//
// Switch scenarios from the browser console (then refresh the page):
//   localStorage.setItem('mock-reg-mode', 'open' | 'invite_only' | 'domain')
//   localStorage.setItem('mock-company-status', 'pending' | 'approved' | 'rejected')
//   localStorage.removeItem('mock-resumes')   // reset the fake resume list
import axios, { type AxiosAdapter } from 'axios';
import { bodyOf, errorBody, respond } from './helpers';
import { handleResumeMock } from './resumes';

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

const REG_MODES = ['open', 'invite_only', 'domain'] as const;
const COMPANY_STATUSES = ['pending', 'approved', 'rejected'] as const;
const ALLOWED_DOMAINS = ['college.edu', 'students.college.edu'];

function readFlag<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  const url = (config.url ?? '').split('?')[0];
  const regMode = readFlag('mock-reg-mode', REG_MODES, 'open');
  const companyStatus = readFlag('mock-company-status', COMPANY_STATUSES, 'approved');

  // contract 5.1: GET /auth/registration-mode
  if (method === 'get' && url === '/auth/registration-mode') {
    return respond(config, 200, { mode: regMode, allowedDomains: regMode === 'domain' ? ALLOWED_DOMAINS : [] });
  }

  // contract 5.1: signup is 403 in invite_only, or in domain mode for a wrong email domain
  if (method === 'post' && url === '/auth/signup') {
    if (regMode === 'invite_only') {
      return respond(config, 403, errorBody(403, 'Registration is closed. Contact your administrator.', 'Forbidden'));
    }
    if (regMode === 'domain') {
      const email = String(bodyOf(config).email ?? '');
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
        return respond(config, 403, errorBody(403, `Sign up with an email from: ${ALLOWED_DOMAINS.join(', ')}`, 'Forbidden'));
      }
    }
  }

  // contract 5.1: deactivated user -> 401 "Account disabled" (test with an email starting with "disabled@")
  if (method === 'post' && url === '/auth/login') {
    if (String(bodyOf(config).email ?? '').startsWith('disabled@')) {
      return respond(config, 401, errorBody(401, 'Account disabled', 'Unauthorized'));
    }
  }

  // contract 4.4: company profile gets `status` (real call, status added on top)
  if (method === 'get' && url === '/companies/me') {
    const real = await axios.getAdapter(axios.defaults.adapter)(config);
    return { ...real, data: { ...real.data, status: companyStatus } };
  }

  // contract 5.5: unapproved company cannot upload or add roles
  const isRoleCreate = method === 'post' && /^\/jobs\/[^/]+\/roles$/.test(url);
  const isUpload = method === 'post' && url === '/jobs/upload';
  if ((isRoleCreate || isUpload) && companyStatus !== 'approved') {
    return respond(config, 403, errorBody(403, 'Company is not approved yet', 'Forbidden'));
  }

  // contract 5.4: resume-service (list, upload, delete, patch, target-roles)
  const resumeResponse = handleResumeMock(method, url, config);
  if (resumeResponse) return resumeResponse;

  // everything else goes to the real backend
  return axios.getAdapter(axios.defaults.adapter)(config);
};