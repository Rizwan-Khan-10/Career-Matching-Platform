import { afterAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { api } from '../src/http';

describe('checkpoint 15: Google sign-in follows the registration mode', () => {
  afterAll(async () => {
    await applySettings(TEST_DEFAULTS);
  });

  it('is closed when registration is off (invite_only) and the API says so', async () => {
    await applySettings({ registrationMode: 'invite_only' });

    const mode = await api('/auth/registration-mode');
    expect(mode.body.googleEnabled).toBe(false);
    expect(mode.body.googleClientId).toBeNull();

    const res = await api('/auth/google', { method: 'POST', json: { credential: 'not-a-real-token' } });
    expect(res.status).toBe(403);
  });

  it('is closed in domain mode too', async () => {
    await applySettings({ registrationMode: 'domain', allowedDomains: ['college.example'] });

    const mode = await api('/auth/registration-mode');
    expect(mode.body.googleEnabled).toBe(false);

    const res = await api('/auth/google', { method: 'POST', json: { credential: 'not-a-real-token' } });
    expect(res.status).toBe(403);
  });

  it('in open mode a fake token is refused (401), or 503 when GOOGLE_CLIENT_ID is not set', async () => {
    await applySettings({ registrationMode: 'open' });

    const res = await api('/auth/google', { method: 'POST', json: { credential: 'not-a-real-token', role: 'APPLICANT' } });
    expect([401, 503]).toContain(res.status);
  });
});