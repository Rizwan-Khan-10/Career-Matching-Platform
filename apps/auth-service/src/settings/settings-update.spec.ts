import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

type UpdateSettingsInput = Parameters<SettingsService['update']>[0];

function build() {
  const upsert = vi.fn((args: unknown) => args);
  const prisma = {
    systemSetting: { upsert, findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { service: new SettingsService(prisma as any), prisma, upsert };
}

const base: UpdateSettingsInput = {
  registrationMode: 'open',
  allowedDomains: [],
  companyApprovalRequired: true,
  jobApprovalRequired: false,
};

describe('SettingsService.update', () => {
  it('upserts all four keys in one transaction', async () => {
    const { service, prisma, upsert } = build();
    await service.update({ ...base, registrationMode: 'invite_only', jobApprovalRequired: true });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const keys = upsert.mock.calls.map(([args]: any) => args.where.key);
    expect(keys).toEqual(['registrationMode', 'allowedDomains', 'companyApprovalRequired', 'jobApprovalRequired']);
    expect(upsert.mock.calls[0][0]).toMatchObject({ create: { value: 'invite_only' } });
  });

  it('normalizes and de-duplicates domains', async () => {
    const { service, upsert } = build();
    await service.update({ ...base, registrationMode: 'domain', allowedDomains: [' @College.edu', 'college.edu', ''] });
    const domains = upsert.mock.calls.find(([a]: any) => a.where.key === 'allowedDomains')![0] as any;
    expect(domains.create.value).toEqual(['college.edu']);
  });

  it('rejects an invalid domain with a readable message', async () => {
    const { service, prisma } = build();
    await expect(service.update({ ...base, allowedDomains: ['not a domain'] })).rejects.toThrow('is not a valid domain');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses domain mode with an empty allow-list', async () => {
    const { service, prisma } = build();
    await expect(service.update({ ...base, registrationMode: 'domain' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

    it('saves the newer flags only when they are sent', async () => {
    const { service, upsert } = build();

    await service.update(base);
    expect(upsert.mock.calls.map(([a]: any) => a.where.key)).toEqual([
      'registrationMode', 'allowedDomains', 'companyApprovalRequired', 'jobApprovalRequired',
    ]);

    upsert.mockClear();
    await service.update({ ...base, requireTwoFactorForAdmin: true, emailVerificationRequired: false });
    const keys = upsert.mock.calls.map(([a]: any) => a.where.key);
    expect(keys).toContain('requireTwoFactorForAdmin');
    expect(keys).toContain('emailVerificationRequired');
  });
});