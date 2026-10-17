import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, adminActor, applySettings, setCompanyStatus } from '../src/admin';
import { api, ok } from '../src/http';
import { newCompany, uploadJobDoc } from '../src/scenario';

describe('checkpoint 12: admin health and audit', () => {
  beforeAll(() => applySettings({ ...TEST_DEFAULTS, companyApprovalRequired: true }));
  afterAll(() => applySettings(TEST_DEFAULTS));

  it('health lists streams with length and dead-letter counts', async () => {
    const admin = await adminActor();
    const health = ok(await api('/admin/health', { token: admin.token }), 'GET /admin/health');
    expect(Array.isArray(health.streams)).toBe(true);
    expect(health.streams.length).toBeGreaterThan(0);
    for (const stream of health.streams) {
      expect(stream.name).toEqual(expect.any(String));
      expect(stream.length).toEqual(expect.any(Number));
      expect(stream.deadLength).toEqual(expect.any(Number));
    }
  });

  it('the audit log shows a company approval', async () => {
    const company = await newCompany('cp12');
    await setCompanyStatus(company.userId, 'approved');

    const admin = await adminActor();
    const audit = ok(await api('/admin/audit', { token: admin.token, query: { limit: 100 } }), 'GET /admin/audit');
    const entry = audit.find((e: any) => JSON.stringify(e).includes(company.userId));
    expect(entry).toBeTruthy();
    expect(entry.actorId).toBe(admin.userId);
    expect(entry.action).toMatch(/company|status/i);
    expect(new Date(entry.createdAt).getTime()).toBeGreaterThan(Date.now() - 10 * 60_000);
  });

  it('job approval: a new job waits for the admin when the switch is on', async () => {
    await applySettings({ jobApprovalRequired: true, companyApprovalRequired: false });
    const company = await newCompany('cp12-job');
    const posting = ok(await uploadJobDoc(company), 'POST /jobs/upload');

    const admin = await adminActor();
    const pending = ok(await api('/jobs/admin/pending', { token: admin.token }), 'GET /jobs/admin/pending');
    expect(pending.some((j: any) => j.id === posting.id)).toBe(true);
    const mine = ok(await api('/jobs/mine', { token: company.token }), 'GET /jobs/mine');
    expect(mine.find((j: any) => j.id === posting.id)?.approvalStatus).toBe('pending');

    ok(await api(`/jobs/admin/${posting.id}/approval`, { method: 'PATCH', token: admin.token, json: { approved: true } }), 'approve job');
    const after = ok(await api('/jobs/mine', { token: company.token }), 'GET /jobs/mine');
    expect(after.find((j: any) => j.id === posting.id)?.approvalStatus).toBe('approved');
  });
});