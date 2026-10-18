import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { AuthService } from './auth.service';
import { DEFAULT_SETTINGS, SystemSettings } from '../settings/settings';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

const PASSWORD = 'Password123';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function build(settings: Partial<SystemSettings> = {}, existingUser: any = null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data })),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue('tok'), verify: vi.fn() };
  const redis = {
    client: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn() },
  };
  const mail = { enqueuePasswordReset: vi.fn() };
  const settingsService = { getAll: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings }) };
  const service = new AuthService(prisma as any, jwt as any, redis as any, mail as any, settingsService as any);
  return { service, prisma, jwt, redis };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_SERVICE_URL = 'http://user-service';
  process.env.INTERNAL_API_KEY = 'internal-key';
});

describe('AuthService.signup', () => {
  const companyDto = { email: 'hr@acme.com', password: PASSWORD, role: 'COMPANY' } as const;

  it('creates the user in open mode and sends companyStatus=pending when approval is required', async () => {
    const { service, prisma } = build({ registrationMode: 'open', companyApprovalRequired: true });
    const result = await service.signup(companyDto);

    expect(prisma.user.create).toHaveBeenCalledOnce();
    expect(result.role).toBe('COMPANY');
    expect(axios.post).toHaveBeenCalledWith(
      'http://user-service/internal/profiles',
      expect.objectContaining({ userId: 'u1', role: 'COMPANY', companyStatus: 'pending' }),
      expect.objectContaining({ timeout: 5000, headers: { 'x-internal-key': 'internal-key' } }),
    );
  });

  it('sends companyStatus=approved when company approval is switched off', async () => {
    const { service } = build({ registrationMode: 'open', companyApprovalRequired: false });
    await service.signup(companyDto);
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ companyStatus: 'approved' }),
      expect.anything(),
    );
  });

  it('rejects signup with 403 in invite_only mode and creates nothing', async () => {
    const { service, prisma } = build({ registrationMode: 'invite_only' });
    await expect(service.signup(companyDto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects a non-allowed domain in domain mode', async () => {
    const { service, prisma } = build({ registrationMode: 'domain', allowedDomains: ['college.edu'] });
    await expect(
      service.signup({ email: 'a@gmail.com', password: PASSWORD, role: 'APPLICANT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('accepts an allowed domain in domain mode', async () => {
    const { service, prisma } = build({ registrationMode: 'domain', allowedDomains: ['college.edu'] });
    await service.signup({ email: 'a@college.edu', password: PASSWORD, role: 'APPLICANT' });
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });
});

describe('AuthService.login / refresh with a disabled account', () => {
  const user = (isActive: boolean) => ({ id: 'u1', email: 'a@b.com', role: 'APPLICANT', passwordHash: HASH, isActive });

  it('logs an active user in', async () => {
    const { service } = build({}, user(true));
    const result = await service.login({ email: 'a@b.com', password: PASSWORD });
    expect(result.accessToken).toBe('tok');
  });

  it('returns 401 "Account disabled" when the password is right but the account is disabled', async () => {
    const { service } = build({}, user(false));
    const err = await service.login({ email: 'a@b.com', password: PASSWORD }).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe('Account disabled');
  });

  it('does not reveal a disabled account when the password is wrong', async () => {
    const { service } = build({}, user(false));
    const err = await service.login({ email: 'a@b.com', password: 'wrong-password' }).catch((e) => e);
    expect(err.message).toBe('Invalid credentials');
  });

  it('refuses to refresh tokens for a disabled account', async () => {
    const { service, jwt, redis } = build({}, { id: 'u1', role: 'APPLICANT', isActive: false });
    jwt.verify.mockReturnValue({ sub: 'u1', role: 'APPLICANT' });
    redis.client.get.mockResolvedValue('rt');
    const err = await service.refresh('rt').catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe('Account disabled');
  });

  it('refreshes tokens for an active account', async () => {
    const { service, jwt, redis } = build({}, { id: 'u1', role: 'APPLICANT', isActive: true });
    jwt.verify.mockReturnValue({ sub: 'u1', role: 'APPLICANT' });
    redis.client.get.mockResolvedValue('rt');
    const result = await service.refresh('rt');
    expect(result.role).toBe('APPLICANT');
  });
});