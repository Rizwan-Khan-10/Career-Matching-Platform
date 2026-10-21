import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { FakeRedis } from '../../test/fake-redis';
import { AuthService } from './auth.service';
import { LoginLockService } from './login-lock.service';
import { SessionStore } from '../sessions/session-store.service';
import { DEFAULT_SETTINGS, SystemSettings } from '../settings/settings';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('bcrypt', async (importOriginal) => {
  const actual: any = await importOriginal();
  const real = actual.default ?? actual;
  return { ...real, default: real, compare: vi.fn(real.compare) };
});

const PASSWORD = 'Password123';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const activeUser = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'a@b.com', role: 'APPLICANT', passwordHash: HASH, isActive: true, ...over,
});

function build(settings: Partial<SystemSettings> = {}, existingUser: any = null) {
  const fake = new FakeRedis();
  const redis = { client: fake };
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data })),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const jwt = new JwtService({});
  const mail = { enqueuePasswordReset: vi.fn() };
  const settingsService = { getAll: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings }) };
  const twoFactor = {
    createChallenge: vi.fn().mockResolvedValue('chal-1'),
    verifyChallenge: vi.fn(),
    recoveryCodesLeft: vi.fn().mockResolvedValue(7),
  };
  const service = new AuthService(
    prisma as any, jwt, redis as any, mail as any, settingsService as any,
    new SessionStore(redis as any), new LoginLockService(redis as any), twoFactor as any,
  );
  const sid = (token: string) => (jwt.decode(token) as { sid: string }).sid;
  return { service, prisma, fake, jwt, sid, twoFactor };
}

/**
 * login() can answer with a 2FA challenge instead of tokens. The tests below are about users without 2FA,
 * so this returns the tokens (typed) and fails loudly if a challenge comes back.
 */
async function loginTokens(service: AuthService, creds: { email: string; password: string }, ip?: string) {
  const result = await service.login(creds, ip);
  if ('twoFactorRequired' in result) throw new Error('expected tokens but got a two-factor challenge');
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_SERVICE_URL = 'http://user-service';
  process.env.INTERNAL_API_KEY = 'internal-key';
  process.env.JWT_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
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
  it('logs an active user in', async () => {
    const { service } = build({}, activeUser());
    const result = await loginTokens(service, { email: 'a@b.com', password: PASSWORD });
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it('returns 401 "Account disabled" when the password is right but the account is disabled', async () => {
    const { service } = build({}, activeUser({ isActive: false }));
    const err = await service.login({ email: 'a@b.com', password: PASSWORD }).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe('Account disabled');
  });

  it('does not reveal a disabled account when the password is wrong', async () => {
    const { service } = build({}, activeUser({ isActive: false }));
    const err = await service.login({ email: 'a@b.com', password: 'wrong-password' }).catch((e) => e);
    expect(err.message).toBe('Invalid credentials');
  });

  it('refuses to refresh tokens once the account is disabled', async () => {
    const { service, prisma } = build({}, activeUser());
    const { refreshToken } = await loginTokens(service, { email: 'a@b.com', password: PASSWORD });

    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'APPLICANT', isActive: false });
    const err = await service.refresh(refreshToken).catch((e) => e);

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe('Account disabled');
  });

  it('refreshes tokens for an active account', async () => {
    const { service } = build({}, activeUser());
    const { refreshToken } = await loginTokens(service, { email: 'a@b.com', password: PASSWORD });
    const result = await service.refresh(refreshToken);
    expect(result.role).toBe('APPLICANT');
  });
});

describe('AuthService per-device sessions', () => {
  it('gives every login its own session id and stores one key per session', async () => {
    const { service, fake, sid } = build({}, activeUser());
    const a = await loginTokens(service, { email: 'a@b.com', password: PASSWORD }, '1.1.1.1');
    const b = await loginTokens(service, { email: 'a@b.com', password: PASSWORD }, '2.2.2.2');

    expect(sid(a.accessToken)).not.toBe(sid(b.accessToken));
    expect(fake.store.has(`refresh:u1:${sid(a.accessToken)}`)).toBe(true);
    expect(fake.store.has(`refresh:u1:${sid(b.accessToken)}`)).toBe(true);
  });

  it('logout on one device does not log out the other device', async () => {
    const { service, sid } = build({}, activeUser());
    const phone = await loginTokens(service, { email: 'a@b.com', password: PASSWORD }, '1.1.1.1');
    const laptop = await loginTokens(service, { email: 'a@b.com', password: PASSWORD }, '2.2.2.2');

    await service.logout('u1', sid(phone.accessToken));

    await expect(service.refresh(phone.refreshToken)).rejects.toThrow('Refresh token no longer valid');
    await expect(service.refresh(laptop.refreshToken)).resolves.toMatchObject({ role: 'APPLICANT' });
  });

  it('logout without a session id (old access token) is a harmless no-op', async () => {
    const { service } = build({}, activeUser());
    const a = await loginTokens(service, { email: 'a@b.com', password: PASSWORD });
    await expect(service.logout('u1')).resolves.toEqual({ message: 'Logged out' });
    await expect(service.refresh(a.refreshToken)).resolves.toBeDefined();
  });

  it('refresh keeps the same session id', async () => {
    const { service, sid } = build({}, activeUser());
    const first = await loginTokens(service, { email: 'a@b.com', password: PASSWORD });
    const second = await service.refresh(first.refreshToken);
    expect(sid(second.accessToken)).toBe(sid(first.accessToken));
  });

  it('rejects a refresh token that has no session id (issued before this change)', async () => {
    const { service, jwt } = build({}, activeUser());
    const legacy = jwt.sign({ sub: 'u1', role: 'APPLICANT' }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' });
    await expect(service.refresh(legacy)).rejects.toThrow('Invalid or expired refresh token');
  });

  it('a password reset signs out every device of that user only', async () => {
    const { service, fake } = build({}, activeUser());
    const a = await loginTokens(service, { email: 'a@b.com', password: PASSWORD }, '1.1.1.1');
    const b = await loginTokens(service, { email: 'a@b.com', password: PASSWORD }, '2.2.2.2');
    fake.store.set('refresh:u2:other-device', 'x');
    fake.store.set('reset:tok', 'u1');

    await service.resetPassword('tok', 'a-new-password-1');

    await expect(service.refresh(a.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(b.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fake.store.has('refresh:u2:other-device')).toBe(true);
    expect(fake.store.has('reset:tok')).toBe(false);
  });
});

describe('AuthService login lock', () => {
  const wrong = { email: 'a@b.com', password: 'wrong-password' };
  const right = { email: 'a@b.com', password: PASSWORD };

  it('locks only the IP that failed 5 times, even for the right password', async () => {
    const { service } = build({}, activeUser());
    for (let i = 0; i < 5; i++) await expect(service.login(wrong, '1.1.1.1')).rejects.toThrow('Invalid credentials');

    await expect(service.login(right, '1.1.1.1')).rejects.toThrow('Too many failed attempts');
    await expect(service.login(right, '2.2.2.2')).resolves.toMatchObject({ role: 'APPLICANT' });
  });

  it('blocks every IP after 20 failures for one email', async () => {
    const { service } = build({}, activeUser());
    for (let i = 0; i < 20; i++) await expect(service.login(wrong, `10.0.0.${i}`)).rejects.toThrow('Invalid credentials');

    await expect(service.login(right, '9.9.9.9')).rejects.toThrow('Too many failed attempts');
  });

  it('treats the email case-insensitively, so changing the case does not dodge the lock', async () => {
    const { service, prisma } = build({}, activeUser());
    for (let i = 0; i < 5; i++) await service.login({ ...wrong, email: 'A@B.com' }, '1.1.1.1').catch(() => undefined);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
    await expect(service.login(right, '1.1.1.1')).rejects.toThrow('Too many failed attempts');
  });

  it('a successful login clears the failures of that email on that IP', async () => {
    const { service, fake } = build({}, activeUser());
    for (let i = 0; i < 4; i++) await service.login(wrong, '1.1.1.1').catch(() => undefined);

    await service.login(right, '1.1.1.1');

    expect(fake.store.has('login-attempts:ip:a@b.com:1.1.1.1')).toBe(false);
  });
});

describe('AuthService.login: no user enumeration', () => {
  it('gives the same status and message for an unknown email and a wrong password', async () => {
    const unknown = await build({}, null).service
      .login({ email: 'nobody@b.com', password: 'whatever123' })
      .catch((e) => e);
    const wrong = await build({}, activeUser()).service
      .login({ email: 'a@b.com', password: 'wrong-password' })
      .catch((e) => e);

    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect(unknown.getStatus()).toBe(wrong.getStatus());
    expect(unknown.message).toBe(wrong.message);
    expect(unknown.message).toBe('Invalid credentials');
  });

  it('runs bcrypt.compare even when the email does not exist', async () => {
    (bcrypt.compare as any).mockClear();
    await build({}, null).service.login({ email: 'nobody@b.com', password: 'whatever123' }).catch(() => { });
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('still counts the failure for an unknown email (lock applies to it too)', async () => {
    const { service, fake } = build({}, null);
    await service.login({ email: 'nobody@b.com', password: 'x' }, '9.9.9.9').catch(() => { });
    expect(fake.store.get('login-attempts:ip:nobody@b.com:9.9.9.9')).toBe('1');
  });
});

describe('AuthService two-factor login', () => {
  const creds = { email: 'a@b.com', password: PASSWORD };

  it('returns a challenge and NO tokens when 2FA is on', async () => {
    const { service, fake } = build({}, activeUser({ twoFactorEnabled: true }));
    const result: any = await service.login(creds);

    expect(result).toEqual({ twoFactorRequired: true, challengeId: 'chal-1' });
    expect(result.accessToken).toBeUndefined();
    expect([...fake.store.keys()].some((k) => k.startsWith('refresh:'))).toBe(false);
  });

  it('a wrong password never reaches the challenge step', async () => {
    const { service, twoFactor } = build({}, activeUser({ twoFactorEnabled: true }));
    await service.login({ ...creds, password: 'wrong-password' }).catch(() => {});
    expect(twoFactor.createChallenge).not.toHaveBeenCalled();
  });

  it('users without 2FA log in exactly as before', async () => {
    const { service, twoFactor } = build({}, activeUser());
    const result: any = await service.login(creds);
    expect(result.accessToken).toBeDefined();
    expect(twoFactor.createChallenge).not.toHaveBeenCalled();
  });

  it('issues tokens after a good second factor', async () => {
    const { service, twoFactor } = build();
    twoFactor.verifyChallenge.mockResolvedValue({ user: { id: 'u1', role: 'APPLICANT' }, method: 'totp' });
    const result: any = await service.verifyTwoFactor({ challengeId: 'chal-1', code: '123456' });
    expect(result.accessToken).toBeDefined();
    expect(result.recoveryCodesLeft).toBeUndefined();
  });

  it('tells how many recovery codes are left when one was used', async () => {
    const { service, twoFactor } = build();
    twoFactor.verifyChallenge.mockResolvedValue({ user: { id: 'u1', role: 'APPLICANT' }, method: 'recovery' });
    const result: any = await service.verifyTwoFactor({ challengeId: 'chal-1', recoveryCode: 'abcde-fghjk' });
    expect(result.recoveryCodesLeft).toBe(7);
  });

  it('a password reset does not turn 2FA off', async () => {
    const { service, prisma, fake } = build();
    fake.store.set('reset:tok', 'u1');
    await service.resetPassword('tok', 'a-new-password-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: expect.any(String) },
    });
  });
});