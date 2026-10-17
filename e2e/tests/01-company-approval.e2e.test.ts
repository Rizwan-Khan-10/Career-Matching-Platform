import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, adminActor, applySettings, setCompanyStatus } from '../src/admin';
import { api, ok } from '../src/http';
import { Fatal, eventually } from '../src/poll';
import { newCompany, uploadJobDoc, waitForNotification } from '../src/scenario';

describe('checkpoint 1: open mode and company approval', () => {
  beforeAll(() => applySettings({ registrationMode: 'open', companyApprovalRequired: true, jobApprovalRequired: false }));
  afterAll(() => applySettings(TEST_DEFAULTS));

  it('a new company is pending, cannot upload, and can after the admin approves it', async () => {
    const company = await newCompany('cp1-pending');
    const me = ok(await api('/companies/me', { token: company.token }), 'GET /companies/me');
    expect(me.status).toBe('pending');

    expect((await uploadJobDoc(company)).status).toBe(403);

    const admin = await adminActor();
    const list = ok(await api('/admin/companies', { token: admin.token }), 'GET /admin/companies');
    expect(list.find((c: any) => c.userId === company.userId)?.status).toBe('pending');

    await setCompanyStatus(company.userId, 'approved');

    // job-service caches the company status for up to 60 s
    await eventually(
      'the approved company can upload',
      async () => {
        const res = await uploadJobDoc(company);
        if (res.status === 403) return null;
        if (!res.ok) throw new Fatal(`upload failed with ${res.status} ${JSON.stringify(res.body)}`);
        return res;
      },
      { timeoutMs: 90_000, intervalMs: 5000 },
    );

    const note = await waitForNotification(company, 'company_status');
    expect(note.type).toBe('company_status');
  });

  it('with the approval switch off a new company is active immediately', async () => {
    await applySettings({ companyApprovalRequired: false });
    const company = await newCompany('cp1-active');
    const me = ok(await api('/companies/me', { token: company.token }), 'GET /companies/me');
    expect(me.status).toBe('approved');
    const upload = await uploadJobDoc(company);
    expect(upload.ok).toBe(true);
  });
});