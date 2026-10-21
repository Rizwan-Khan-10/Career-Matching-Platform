import { config } from './config';
import { api, ok } from './http';
import { codeAfter, stepNow } from './totp';

export type Role = 'APPLICANT' | 'COMPANY' | 'ADMIN';

export interface Actor {
  email: string;
  password: string;
  role: Role;
  token: string;
  userId: string;
}

const runId = Date.now().toString(36);
let counter = 0;

/** Every run uses fresh addresses, so reruns never collide with old data. */
export const uniqueEmail = (label: string) => `e2e-${label}-${runId}-${++counter}@example.com`;

export function userIdOf(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return payload.sub as string;
}

export async function signup(role: 'APPLICANT' | 'COMPANY', label: string): Promise<Actor> {
  const email = uniqueEmail(label);
  const body = ok(await api('/auth/signup', { method: 'POST', json: { email, password: config.password, role } }), `signup ${role}`);
  return { email, password: config.password, role, token: body.accessToken, userId: userIdOf(body.accessToken) };
}

// the server accepts one time step only once: remember the last one the admin login used
let lastAdminStep = 0;

export async function login(email: string, password: string): Promise<Actor> {
  let body = ok(await api('/auth/login', { method: 'POST', json: { email, password } }), `login ${email}`);

  if (body.twoFactorRequired) {
    if (email !== config.adminEmail || !config.adminTotpSecret) {
      throw new Error(`${email} has two-factor turned on: for the admin set E2E_ADMIN_TOTP_SECRET in e2e/.env`);
    }
    const code = await codeAfter(config.adminTotpSecret, lastAdminStep);
    lastAdminStep = stepNow();
    body = ok(
      await api('/auth/2fa/verify', { method: 'POST', json: { challengeId: body.challengeId, code } }),
      'admin two-factor verify',
    );
  }

  return { email, password, role: body.role, token: body.accessToken, userId: userIdOf(body.accessToken) };
}