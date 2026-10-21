import { assertAdminCredentials, config } from './config';
import { api, ok } from './http';
import { login, type Actor } from './actors';

// access tokens live 15 minutes: log in again when the cached one is old
const MAX_AGE_MS = 10 * 60_000;
let cached: { actor: Actor; at: number } | undefined;

export async function adminActor(): Promise<Actor> {
  if (!cached || Date.now() - cached.at > MAX_AGE_MS) {
    assertAdminCredentials();
    cached = { actor: await login(config.adminEmail, config.adminPassword), at: Date.now() };
  }
  return cached.actor;
}

export interface Settings {
  registrationMode: 'open' | 'invite_only' | 'domain';
  allowedDomains: string[];
  companyApprovalRequired: boolean;
  jobApprovalRequired: boolean;
  requireTwoFactorForAdmin: boolean;
  emailVerificationRequired: boolean;
}

/** What every checkpoint except 1 and 2 expects: open signup, companies active at once, no job approval, no e-mail step. */
export const TEST_DEFAULTS: Partial<Settings> = {
  registrationMode: 'open',
  companyApprovalRequired: false,
  jobApprovalRequired: false,
  emailVerificationRequired: false,
};

export async function getSettings(): Promise<Settings> {
  const admin = await adminActor();
  return ok(await api('/auth/admin/settings', { token: admin.token }), 'GET /auth/admin/settings');
}

export async function applySettings(patch: Partial<Settings>): Promise<Settings> {
  const admin = await adminActor();
  const next = { ...(await getSettings()), ...patch };
  return ok(await api('/auth/admin/settings', { method: 'PUT', token: admin.token, json: next }), 'PUT /auth/admin/settings');
}

export async function setCompanyStatus(userId: string, status: 'approved' | 'rejected' | 'pending') {
  const admin = await adminActor();
  return ok(
    await api(`/admin/companies/${userId}/status`, { method: 'PATCH', token: admin.token, json: { status } }),
    `set company status ${status}`,
  );
}