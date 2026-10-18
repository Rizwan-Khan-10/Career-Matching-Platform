import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DEFAULT_SETTINGS } from '../settings/settings';
import { SeedConfigError, SeedService, readAdminCredentials } from './seed.service';

const PASSWORD = 'a-very-long-secret-1';
const env = (over: Record<string, string | undefined> = {}) =>
  ({ ADMIN_EMAIL: 'Admin@Example.com ', ADMIN_PASSWORD: PASSWORD, ...over }) as NodeJS.ProcessEnv;

/** In-memory stand-in for the two tables the seed touches. */
function fakePrisma(existingAdmins = 0) {
  const users: any[] = Array.from({ length: existingAdmins }, (_, i) => ({ id: `a${i}`, role: 'ADMIN' }));
  const prisma = {
    user: {
      count: vi.fn(async ({ where }: any) => users.filter((u) => u.role === where.role).length),
      create: vi.fn(async ({ data }: any) => {
        users.push(data);
        return data;
      }),
    },
    systemSetting: { createMany: vi.fn().mockResolvedValue({ count: 4 }) },
  };
  return { users, prisma, service: new SeedService(prisma as any) };
}

describe('SeedService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates one ADMIN with a bcrypt hash and a normalized email', async () => {
    const { users, service } = fakePrisma();
    const result = await service.run(env());

    expect(result.adminCreated).toBe(true);
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe('ADMIN');
    expect(users[0].email).toBe('admin@example.com');
    expect(users[0].passwordHash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, users[0].passwordHash)).toBe(true);
  });

  it('running twice still leaves exactly one admin', async () => {
    const { users, prisma, service } = fakePrisma();
    await service.run(env());
    const second = await service.run(env());

    expect(second.adminCreated).toBe(false);
    expect(users).toHaveLength(1);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('does nothing about the admin when one already exists, even without ADMIN_* variables', async () => {
    const { prisma, service } = fakePrisma(1);
    const result = await service.run({} as NodeJS.ProcessEnv);

    expect(result.adminCreated).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('adds the default settings without overwriting existing rows', async () => {
    const { prisma, service } = fakePrisma(1);
    await service.run(env());

    const args = prisma.systemSetting.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toHaveLength(4);
    expect(args.data).toContainEqual({ key: 'registrationMode', value: DEFAULT_SETTINGS.registrationMode });
    expect(args.data).toContainEqual({ key: 'companyApprovalRequired', value: true });
    expect(args.data).toContainEqual({ key: 'jobApprovalRequired', value: false });
  });

  it('fails clearly when ADMIN_EMAIL / ADMIN_PASSWORD are missing and an admin must be created', async () => {
    const { prisma, service } = fakePrisma();
    await expect(service.run({} as NodeJS.ProcessEnv)).rejects.toThrow('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('treats a lost create race as success when another admin now exists', async () => {
    const { prisma, service } = fakePrisma();
    prisma.user.create.mockImplementationOnce(async () => {
      prisma.user.count.mockResolvedValue(1); // the other instance won
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    });
    await expect(service.run(env())).resolves.toMatchObject({ adminCreated: false });
  });

  it('explains when ADMIN_EMAIL already belongs to a non-admin account', async () => {
    const { prisma, service } = fakePrisma();
    prisma.user.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.run(env())).rejects.toThrow('non-admin account');
  });

  it('never writes the password to the log', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service } = fakePrisma();
    await service.run(env());

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(PASSWORD);
  });
});

describe('readAdminCredentials', () => {
  it('rejects a password shorter than 12 characters without echoing it', () => {
    let message = '';
    try {
      readAdminCredentials(env({ ADMIN_PASSWORD: 'short-pass1' }));
    } catch (err) {
      expect(err).toBeInstanceOf(SeedConfigError);
      message = (err as Error).message;
    }
    expect(message).toContain('at least 12 characters');
    expect(message).not.toContain('short-pass1');
  });

  it('accepts exactly 12 characters', () => {
    expect(readAdminCredentials(env({ ADMIN_PASSWORD: '123456789012' })).password).toBe('123456789012');
  });

  it('rejects an invalid email and an over-long password', () => {
    expect(() => readAdminCredentials(env({ ADMIN_EMAIL: 'not-an-email' }))).toThrow('valid email');
    expect(() => readAdminCredentials(env({ ADMIN_PASSWORD: 'x'.repeat(73) }))).toThrow('at most 72 bytes');
  });
});