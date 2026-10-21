import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
    createSetupChallenge: vi.fn().mockResolvedValue('setup-1'),
    verifyChallenge: vi.fn(),
    recoveryCodesLeft: vi.fn().mockResolvedValue(7),
  };
  const google = { verify: vi.fn() };
  const service = new AuthService(
    prisma as any, jwt, redis as any, mail as any, settingsService as any,
    new SessionStore(redis as any), new LoginLockService(redis as any), twoFactor as any, google as any,
  );
  const sid = (token: string) => (jwt.decode(token) as { sid: string }).sid;
  return { service, prisma, fake, jwt, sid, twoFactor, google };
}

/**
 * login() can answer with a 2FA challenge instead of tokens. The tests below are about users without 2FA,
 * so this returns the tokens (typed) and fails loudly if a challenge comes back.
 */
async function loginTokens(service: AuthService, creds: { email: string; password: string }, ip?: string) {
  const result = await service.login(creds, ip);
  if (!('accessToken' in result)) {
    throw new Error('expected tokens but got a two-factor challenge or setup step');
  }
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
    await service.login({ ...creds, password: 'wrong-password' }).catch(() => { });
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

describe('AuthService.googleLogin', () => {
  const profile = { sub: 'g-123', email: 'Ravi@Gmail.com', emailVerified: true };

  /** findUnique answers by the field it is asked about, like the real table would. */
  function setup(settings: Partial<SystemSettings>, rows: { byGoogle?: any; byEmail?: any } = {}) {
    const ctx = build({ registrationMode: 'open', ...settings });
    ctx.google.verify.mockResolvedValue(profile);
    ctx.prisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.googleId) return rows.byGoogle ?? null;
      if (where.email) return rows.byEmail ?? null;
      return null;
    });
    return ctx;
  }
  const dto = { credential: 'google-id-token' };

  describe('college mode', () => {
    it.each(['invite_only', 'domain'] as const)('is closed in %s mode and never asks Google', async (mode) => {
      const { service, google, prisma } = setup({ registrationMode: mode, allowedDomains: ['college.edu'] });
      await expect(service.googleLogin(dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(google.verify).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('also refuses a user who linked Google earlier, once the mode is closed', async () => {
      const { service } = setup({ registrationMode: 'invite_only' }, { byGoogle: activeUser({ googleId: 'g-123' }) });
      await expect(service.googleLogin(dto)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('token checks', () => {
    it('refuses a bad token and creates nothing', async () => {
      const { service, google, prisma } = setup({});
      google.verify.mockRejectedValue(new UnauthorizedException('Invalid Google sign-in'));
      await expect(service.googleLogin({ ...dto, role: 'APPLICANT' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses an e-mail Google has not verified', async () => {
      const { service, google, prisma } = setup({});
      google.verify.mockResolvedValue({ ...profile, emailVerified: false });
      await expect(service.googleLogin({ ...dto, role: 'APPLICANT' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('looks the e-mail up in lower case', async () => {
      const { service, prisma } = setup({}, { byEmail: activeUser({ googleId: null, twoFactorEnabled: false }) });
      await service.googleLogin(dto);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ravi@gmail.com' } });
    });
  });

  describe('new user', () => {
    it('gets ROLE_REQUIRED when no role was sent, and nothing is created', async () => {
      const { service, prisma } = setup({});
      const err: any = await service.googleLogin(dto).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'ROLE_REQUIRED' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('is created like a normal signup: company starts as pending when approval is required', async () => {
      const { service, prisma } = setup({ companyApprovalRequired: true });
      const result: any = await service.googleLogin({ ...dto, role: 'COMPANY' });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'ravi@gmail.com', googleId: 'g-123', role: 'COMPANY' }),
      });
      expect(axios.post).toHaveBeenCalledWith(
        'http://user-service/internal/profiles',
        expect.objectContaining({ role: 'COMPANY', companyStatus: 'pending' }),
        expect.anything(),
      );
      expect(result.accessToken).toBeDefined();
    });
  });

  describe('existing e-mail', () => {
    it('links the account, replaces the password and ends every session', async () => {
      const { service, prisma, fake } = setup({}, { byEmail: activeUser({ googleId: null, twoFactorEnabled: false }) });
      fake.store.set('refresh:u1:old-device', 'old-token');

      const result: any = await service.googleLogin(dto);

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.googleId).toBe('g-123');
      expect(await bcrypt.compare(PASSWORD, data.passwordHash)).toBe(false); // the old password is dead
      expect(fake.store.has('refresh:u1:old-device')).toBe(false);
      expect(result.accessToken).toBeDefined();
    });

    it('refuses to link an account that has 2FA (it could have been set up by a pre-registerer)', async () => {
      const { service, prisma } = setup({}, { byEmail: activeUser({ googleId: null, twoFactorEnabled: true }) });
      const err: any = await service.googleLogin(dto).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'GOOGLE_LINK_BLOCKED' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an account already tied to a different Google account', async () => {
      const { service, prisma } = setup({}, { byEmail: activeUser({ googleId: 'someone-else', twoFactorEnabled: false }) });
      await expect(service.googleLogin(dto)).rejects.toThrow('Invalid credentials');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses ADMIN accounts with the generic message and changes nothing', async () => {
      const { service, prisma } = setup({}, { byEmail: activeUser({ role: 'ADMIN', googleId: null }) });
      await expect(service.googleLogin(dto)).rejects.toThrow('Invalid credentials');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a disabled account and does not link it', async () => {
      const { service, prisma } = setup({}, { byEmail: activeUser({ isActive: false, googleId: null }) });
      await expect(service.googleLogin(dto)).rejects.toThrow('Account disabled');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('already linked', () => {
    it('signs in without touching the account', async () => {
      const { service, prisma } = setup({}, { byGoogle: activeUser({ googleId: 'g-123', twoFactorEnabled: false }) });
      const result: any = await service.googleLogin(dto);
      expect(result.accessToken).toBeDefined();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still asks for the 2FA code when the user turned it on', async () => {
      const { service, fake } = setup({}, { byGoogle: activeUser({ googleId: 'g-123', twoFactorEnabled: true }) });
      const result: any = await service.googleLogin(dto);
      expect(result).toEqual({ twoFactorRequired: true, challengeId: 'chal-1' });
      expect(result.accessToken).toBeUndefined();
      expect([...fake.store.keys()].some((k) => k.startsWith('refresh:'))).toBe(false);
    });
  });
});

describe('AuthService admin two-factor requirement', () => {
  const creds = { email: 'a@b.com', password: PASSWORD };

  it('sends an admin without 2FA to setup (no tokens) when the setting is on', async () => {
    const { service, fake } = build({ requireTwoFactorForAdmin: true }, activeUser({ role: 'ADMIN' }));
    const result: any = await service.login(creds);

    expect(result).toEqual({ twoFactorSetupRequired: true, setupToken: 'setup-1' });
    expect(result.accessToken).toBeUndefined();
    expect([...fake.store.keys()].some((k) => k.startsWith('refresh:'))).toBe(false);
  });

  it('an admin who already has 2FA gets the normal code challenge', async () => {
    const { service } = build({ requireTwoFactorForAdmin: true }, activeUser({ role: 'ADMIN', twoFactorEnabled: true }));
    expect(await service.login(creds)).toEqual({ twoFactorRequired: true, challengeId: 'chal-1' });
  });

  it('logs the admin in normally when the setting is off', async () => {
    const { service } = build({ requireTwoFactorForAdmin: false }, activeUser({ role: 'ADMIN' }));
    expect((await service.login(creds) as any).accessToken).toBeDefined();
  });

  it('never affects applicants or companies', async () => {
    const { service } = build({ requireTwoFactorForAdmin: true }, activeUser({ role: 'APPLICANT' }));
    expect((await service.login(creds) as any).accessToken).toBeDefined();
  });

  it('finishing the setup returns tokens and the recovery codes', async () => {
    const { service, twoFactor } = build();
    (twoFactor as any).finishSetupLogin = vi.fn().mockResolvedValue({
      user: { id: 'u1', role: 'ADMIN' },
      recoveryCodes: ['aaaaa-bbbbb'],
    });
    const result: any = await service.finishTwoFactorSetupLogin({ setupToken: 'setup-1', code: '123456' });
    expect(result.accessToken).toBeDefined();
    expect(result.recoveryCodes).toEqual(['aaaaa-bbbbb']);
  });
});