import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { login } from '../src/actors';
import { api, ok } from '../src/http';

// Run this after: stop the services, `pnpm db:reset:all`, start the services (see e2e/README.md).
// The reset itself is not done by the test: it would break every running service.
describe('checkpoint 13: fresh database, seeded admin', () => {
  it('the admin from the env can log in and use the admin API', async () => {
    const admin = await login(config.adminEmail, config.adminPassword);
    expect(admin.role).toBe('ADMIN');

    const settings = ok(await api('/auth/admin/settings', { token: admin.token }), 'GET /auth/admin/settings');
    expect(settings).toHaveProperty('registrationMode');
    expect(settings).toHaveProperty('companyApprovalRequired');
    expect(settings).toHaveProperty('jobApprovalRequired');
    expect(settings.allowedDomains).toEqual(expect.any(Array));
  });

  it('a wrong password is refused', async () => {
    const res = await api('/auth/login', { method: 'POST', json: { email: config.adminEmail, password: `${config.adminPassword}-wrong` } });
    expect(res.status).toBe(401);
  });
});