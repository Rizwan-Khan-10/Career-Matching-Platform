import { cleanShortlistDefaults, CompaniesService } from './companies.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../generated/prisma/client', () => ({ Prisma: { DbNull: 'DB_NULL' } }));

describe('cleanShortlistDefaults', () => {
  it('keeps only the known keys, trimmed, and drops empty ones', () => {
    expect(cleanShortlistDefaults({ roundName: '  HR round ', mode: 'online', link: '', note: '   ', scheduledAt: '2026-01-01', evil: 'x' }))
      .toEqual({ roundName: 'HR round', mode: 'online' });
  });

  it('survives junk input', () => {
    expect(cleanShortlistDefaults(null)).toEqual({});
    expect(cleanShortlistDefaults('text')).toEqual({});
    expect(cleanShortlistDefaults({ roundName: 5 })).toEqual({});
  });
});

describe('CompaniesService shortlist defaults', () => {
  let prisma: any;
  let service: CompaniesService;

  beforeEach(() => {
    prisma = {
      companyProfile: {
        upsert: jest.fn().mockResolvedValue({ userId: 'c1', shortlistDefaults: { roundName: 'Tech 1', mode: 'offline', address: 'Pune' } }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new CompaniesService(prisma, {} as any);
  });

  it('returns {} when nothing is saved', async () => {
    prisma.companyProfile.upsert.mockResolvedValue({ userId: 'c1', shortlistDefaults: null });
    await expect(service.getShortlistDefaults('c1')).resolves.toEqual({});
  });

  it('returns the saved template', async () => {
    await expect(service.getShortlistDefaults('c1')).resolves.toEqual({ roundName: 'Tech 1', mode: 'offline', address: 'Pune' });
  });

  it('saves the cleaned template for that company only', async () => {
    const saved = await service.setShortlistDefaults('c1', { roundName: ' HR ', mode: 'phone', link: '' });
    expect(saved).toEqual({ roundName: 'HR', mode: 'phone' });
    expect(prisma.companyProfile.update).toHaveBeenCalledWith({ where: { userId: 'c1' }, data: { shortlistDefaults: { roundName: 'HR', mode: 'phone' } } });
  });

  it('saving nothing clears the template', async () => {
    await service.setShortlistDefaults('c1', { roundName: '', note: null });
    expect(prisma.companyProfile.update).toHaveBeenCalledWith({ where: { userId: 'c1' }, data: { shortlistDefaults: 'DB_NULL' } });
  });
});
