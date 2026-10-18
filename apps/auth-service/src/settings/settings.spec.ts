import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import { SettingsService } from './settings.service';

describe('normalizeSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to open for an unknown registration mode', () => {
    expect(normalizeSettings({ registrationMode: 'weird' }).registrationMode).toBe('open');
  });

  it('lower-cases and trims domains, drops junk entries', () => {
    const s = normalizeSettings({ allowedDomains: [' @College.EDU ', '', 42, 'uni.ac.in'] });
    expect(s.allowedDomains).toEqual(['college.edu', 'uni.ac.in']);
  });

  it('ignores non-boolean flags', () => {
    const s = normalizeSettings({ companyApprovalRequired: 'no', jobApprovalRequired: true });
    expect(s.companyApprovalRequired).toBe(true);
    expect(s.jobApprovalRequired).toBe(true);
  });
});

describe('SettingsService', () => {
  const build = (rows: { key: string; value: unknown }[]) => {
    const prisma = { systemSetting: { findMany: vi.fn().mockResolvedValue(rows) } };
    return new SettingsService(prisma as any);
  };

  it('merges stored rows over the defaults', async () => {
    const service = build([{ key: 'registrationMode', value: 'invite_only' }]);
    const all = await service.getAll();
    expect(all.registrationMode).toBe('invite_only');
    expect(all.companyApprovalRequired).toBe(true);
  });

  it('returns only mode and allowedDomains for the public endpoint', async () => {
    const service = build([
      { key: 'registrationMode', value: 'domain' },
      { key: 'allowedDomains', value: ['college.edu'] },
      { key: 'jobApprovalRequired', value: true },
    ]);
    expect(await service.getRegistrationMode()).toEqual({ mode: 'domain', allowedDomains: ['college.edu'] });
  });
});