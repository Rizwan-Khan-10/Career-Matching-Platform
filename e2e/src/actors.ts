import { config } from './config';
import { api, ok } from './http';

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

export async function login(email: string, password: string): Promise<Actor> {
  const body = ok(await api('/auth/login', { method: 'POST', json: { email, password } }), `login ${email}`);
  return { email, password, role: body.role, token: body.accessToken, userId: userIdOf(body.accessToken) };
}