import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, adminActor, applySettings } from '../src/admin';
import { login, uniqueEmail } from '../src/actors';
import { config } from '../src/config';
import { api, ok } from '../src/http';
import { setupToken } from '../src/redis';
import { uploadJobDoc } from '../src/scenario';

describe('checkpoint 2: invite-only mode and CSV import', () => {
  beforeAll(() => applySettings({ registrationMode: 'invite_only' }));
  afterAll(() => applySettings(TEST_DEFAULTS));

  const studentEmail = uniqueEmail('cp2-student');
  const companyEmail = uniqueEmail('cp2-company');
  const users = [
    { email: studentEmail, role: 'APPLICANT', name: 'E2E Student', cgpa: 8.2, branch: 'Computer Science', passingYear: 2026, backlogs: 0 },
    { email: companyEmail, role: 'COMPANY', name: 'E2E Imported Co' },
  ];

  it('self-signup is refused with 403', async () => {
    const res = await api('/auth/signup', {
      method: 'POST',
      json: { email: uniqueEmail('cp2-closed'), password: config.password, role: 'APPLICANT' },
    });
    expect(res.status).toBe(403);
  });

  it('imported users set a password and log in; academic fields are locked; the company is active at once', async () => {
    const admin = await adminActor();
    const result = ok(await api('/auth/admin/users/import', { method: 'POST', token: admin.token, json: { users } }), 'import');
    expect(result.skipped).toHaveLength(0);
    expect(result.created.map((c: any) => c.email).sort()).toEqual([studentEmail, companyEmail].sort());

    // "set your password" (the link is e-mailed: the token is read from Redis)
    for (const created of result.created as { email: string; id: string }[]) {
      const resetToken = await setupToken(created.email, created.id);
      ok(await api('/auth/reset-password', { method: 'POST', json: { resetToken, newPassword: config.password } }), 'reset-password');
    }

    const student = await login(studentEmail, config.password);
    const me = ok(await api('/applicants/me', { token: student.token }), 'GET /applicants/me');
    expect(me).toMatchObject({ cgpa: 8.2, branch: 'Computer Science', passingYear: 2026, backlogs: 0, academicVerified: true });

    // the applicant cannot overwrite verified values: the request is accepted, the values stay
    ok(await api('/applicants/me', { method: 'PATCH', token: student.token, json: { cgpa: 4.1, branch: 'Mechanical' } }), 'PATCH /applicants/me');
    const after = ok(await api('/applicants/me', { token: student.token }), 'GET /applicants/me');
    expect(after).toMatchObject({ cgpa: 8.2, branch: 'Computer Science' });

    const company = await login(companyEmail, config.password);
    const profile = ok(await api('/companies/me', { token: company.token }), 'GET /companies/me');
    expect(profile.status).toBe('approved');
    expect((await uploadJobDoc(company)).ok).toBe(true);
  });

  it('importing the same address again is skipped, not duplicated', async () => {
    const admin = await adminActor();
    const result = ok(await api('/auth/admin/users/import', { method: 'POST', token: admin.token, json: { users: [users[0]] } }), 'import again');
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].email).toBe(studentEmail);
  });
});