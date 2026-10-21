import { BadRequestException, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { FakeRedis } from '../../../test/fake-redis';
import { RateLimitService } from '../rate-limit.service';
import { SessionStore } from '../../sessions/session-store.service';
import { decryptSecret } from './secret-crypto';
import { currentStep, totpForStep } from './totp';
import { TwoFactorService } from './two-factor.service';

const PASSWORD = 'Password123';

function build(userOver: Record<string, unknown> = {}) {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'a'.repeat(64);
    const fake = new FakeRedis();
    const redis = { client: fake } as any;
    const user: any = {
        id: 'u1', email: 'a@b.com', role: 'APPLICANT', isActive: true,
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        twoFactorEnabled: false, twoFactorSecret: null, ...userOver,
    };
    const codes: any[] = [];
    const prisma: any = {
        user: {
            findUnique: vi.fn(async () => user),
            update: vi.fn(async ({ data }: any) => Object.assign(user, data)),
        },
        recoveryCode: {
            findMany: vi.fn(async () => codes.filter((c) => !c.usedAt)),
            count: vi.fn(async () => codes.filter((c) => !c.usedAt).length),
            deleteMany: vi.fn(async () => { codes.length = 0; return { count: 0 }; }),
            createMany: vi.fn(async ({ data }: any) => {
                data.forEach((d: any, i: number) => codes.push({ id: `c${codes.length + i}`, usedAt: null, ...d }));
                return { count: data.length };
            }),
            updateMany: vi.fn(async ({ where }: any) => {
                const c = codes.find((x) => x.id === where.id && !x.usedAt);
                if (!c) return { count: 0 };
                c.usedAt = new Date();
                return { count: 1 };
            }),
        },
        $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
    };
    const sessions = new SessionStore(redis);
    const settings = { getAll: vi.fn(async () => ({ requireTwoFactorForAdmin: false })) };
    const service = new TwoFactorService(prisma, redis, sessions, new RateLimitService(redis), settings as any);
    return { service, prisma, fake, user, codes, settings };
}

// offset -1 / 0 / +1 = three different 30 s steps, all accepted, but each only once
const codeAt = (secret: string, offset: number) => totpForStep(secret, currentStep() + offset);

/** Runs setup + enable. Uses step 0, so tests below use -1 or +1 for their own codes. */
async function enrolled(over: Record<string, unknown> = {}) {
    const ctx = build(over);
    const { secret } = await ctx.service.setup('u1');
    const { recoveryCodes } = await ctx.service.enable('u1', 's1', codeAt(secret, 0));
    return { ...ctx, secret, recoveryCodes };
}

describe('TwoFactorService enrolment', () => {
    it('stores the secret encrypted and not enabled after setup', async () => {
        const { service, user } = build();
        const { secret, otpauthUrl } = await service.setup('u1');

        expect(user.twoFactorEnabled).toBe(false);
        expect(user.twoFactorSecret).not.toContain(secret);
        expect(decryptSecret(user.twoFactorSecret)).toBe(secret);
        expect(otpauthUrl).toContain('otpauth://totp/CareerMatch');
    });

    it('refuses a wrong code and keeps 2FA off', async () => {
        const { service, user } = build();
        await service.setup('u1');
        await expect(service.enable('u1', 's1', '000000')).rejects.toBeInstanceOf(BadRequestException);
        expect(user.twoFactorEnabled).toBe(false);
    });

    it('enables with a good code, returns 10 recovery codes and stores only hashes', async () => {
        const { user, recoveryCodes, codes } = await enrolled();
        expect(user.twoFactorEnabled).toBe(true);
        expect(recoveryCodes).toHaveLength(10);
        expect(codes).toHaveLength(10);
        expect(codes.some((c) => recoveryCodes.includes(c.codeHash))).toBe(false);
    });

    it('refuses setup when 2FA is already on', async () => {
        const { service } = await enrolled();
        await expect(service.setup('u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 503 when the encryption key is not configured', async () => {
        const { service } = build();
        delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
        await expect(service.setup('u1')).rejects.toThrow('not configured');
    });
});

describe('TwoFactorService replay and disable', () => {
    it('refuses the same code twice (replay)', async () => {
        const { service, secret } = await enrolled(); // enable already used step 0
        await expect(
            service.disable('u1', 's1', { password: PASSWORD, code: codeAt(secret, 0) }),
        ).rejects.toThrow('Invalid code');
    });

    it('disables with password + a fresh code and wipes the recovery codes', async () => {
        const { service, secret, user, codes } = await enrolled();
        await service.disable('u1', 's1', { password: PASSWORD, code: codeAt(secret, -1) });
        expect(user.twoFactorEnabled).toBe(false);
        expect(user.twoFactorSecret).toBeNull();
        expect(codes).toHaveLength(0);
    });

    it('refuses disable with a wrong password', async () => {
        const { service, secret } = await enrolled();
        await expect(
            service.disable('u1', 's1', { password: 'nope-nope', code: codeAt(secret, -1) }),
        ).rejects.toThrow('Incorrect password');
    });

    it('keeps the current device signed in, signs the others out', async () => {
        const { service, secret, fake } = await enrolled();
        fake.store.set('refresh:u1:s1', 'tok');
        fake.store.set('refresh:u1:other', 'tok');
        await service.disable('u1', 's1', { password: PASSWORD, code: codeAt(secret, -1) });
        expect(fake.store.has('refresh:u1:s1')).toBe(true);
        expect(fake.store.has('refresh:u1:other')).toBe(false);
    });

    it('new recovery codes kill the old ones', async () => {
        const { service, secret, recoveryCodes } = await enrolled();
        const fresh = await service.regenerateRecoveryCodes('u1', { password: PASSWORD, code: codeAt(secret, -1) });
        expect(fresh.recoveryCodes).toHaveLength(10);

        const challenge = await service.createChallenge('u1');
        await expect(
            service.verifyChallenge(challenge, { recoveryCode: recoveryCodes[0] }, '1.1.1.1'),
        ).rejects.toThrow('Invalid code');
    });
});

describe('TwoFactorService login challenge', () => {
    it('accepts a good code and the challenge works only once', async () => {
        const { service, secret } = await enrolled();
        const challenge = await service.createChallenge('u1');

        const { method } = await service.verifyChallenge(challenge, { code: codeAt(secret, 1) }, '1.1.1.1');
        expect(method).toBe('totp');
        await expect(
            service.verifyChallenge(challenge, { code: codeAt(secret, -1) }, '1.1.1.1'),
        ).rejects.toThrow('expired');
    });

    it('a recovery code works once', async () => {
        const { service, recoveryCodes } = await enrolled();

        const first = await service.createChallenge('u1');
        const ok = await service.verifyChallenge(first, { recoveryCode: recoveryCodes[0].toUpperCase() }, '1.1.1.1');
        expect(ok.method).toBe('recovery');
        expect(await service.recoveryCodesLeft('u1')).toBe(9);

        const second = await service.createChallenge('u1');
        await expect(
            service.verifyChallenge(second, { recoveryCode: recoveryCodes[0] }, '1.1.1.1'),
        ).rejects.toThrow('Invalid code');
    });

    it('5 wrong codes delete the challenge and lock the user for a while', async () => {
        const { service, secret } = await enrolled();
        const challenge = await service.createChallenge('u1');

        for (let i = 0; i < 5; i++) {
            await expect(service.verifyChallenge(challenge, { code: '000000' }, '1.1.1.1')).rejects.toThrow('Invalid code');
        }
        await expect(
            service.verifyChallenge(challenge, { code: codeAt(secret, 1) }, '1.1.1.1'),
        ).rejects.toThrow('expired');

        const fresh = await service.createChallenge('u1');
        await expect(
            service.verifyChallenge(fresh, { code: codeAt(secret, 1) }, '1.1.1.1'),
        ).rejects.toThrow('Too many wrong codes');
    });

    it('an unknown or expired challenge is refused', async () => {
        const { service } = await enrolled();
        await expect(service.verifyChallenge('nope', { code: '123456' }, '1.1.1.1')).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('a user who was deactivated after the password step cannot finish login', async () => {
        const { service, secret, user } = await enrolled();
        const challenge = await service.createChallenge('u1');
        user.isActive = false;
        await expect(
            service.verifyChallenge(challenge, { code: codeAt(secret, 1) }, '1.1.1.1'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});

describe('TwoFactorService: required for admins', () => {
    it('setup-only login: start, finish with a good code, token is single use', async () => {
        const { service, user } = build({ role: 'ADMIN' });
        const token = await service.createSetupChallenge('u1');

        const { secret } = await service.startSetupLogin(token, '1.1.1.1');
        const done = await service.finishSetupLogin(token, codeAt(secret, 0), '1.1.1.1');

        expect(user.twoFactorEnabled).toBe(true);
        expect(done.recoveryCodes).toHaveLength(10);
        await expect(service.startSetupLogin(token, '1.1.1.1')).rejects.toThrow('expired');
    });

    it('a wrong code does not burn the setup token', async () => {
        const { service } = build({ role: 'ADMIN' });
        const token = await service.createSetupChallenge('u1');
        const { secret } = await service.startSetupLogin(token, '1.1.1.1');

        await expect(service.finishSetupLogin(token, '000000', '1.1.1.1')).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.finishSetupLogin(token, codeAt(secret, 0), '1.1.1.1')).resolves.toBeDefined();
    });

    it('refuses an unknown setup token and a user who already has 2FA', async () => {
        const { service } = build({ role: 'ADMIN' });
        await expect(service.startSetupLogin('nope', '1.1.1.1')).rejects.toBeInstanceOf(UnauthorizedException);

        const enrolledCtx = await enrolled({ role: 'ADMIN' });
        const token = await enrolledCtx.service.createSetupChallenge('u1');
        await expect(enrolledCtx.service.startSetupLogin(token, '1.1.1.1')).rejects.toThrow('expired');
    });

    it('an admin cannot turn 2FA off while it is required', async () => {
        const ctx = await enrolled({ role: 'ADMIN' });
        ctx.settings.getAll.mockResolvedValue({ requireTwoFactorForAdmin: true });

        await expect(
            ctx.service.disable('u1', 's1', { password: PASSWORD, code: codeAt(ctx.secret, -1) }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(ctx.user.twoFactorEnabled).toBe(true);
    });

    it('an admin may turn it off when it is not required, and users are never blocked', async () => {
        const admin = await enrolled({ role: 'ADMIN' });
        await admin.service.disable('u1', 's1', { password: PASSWORD, code: codeAt(admin.secret, -1) });
        expect(admin.user.twoFactorEnabled).toBe(false);

        const applicant = await enrolled();
        applicant.settings.getAll.mockResolvedValue({ requireTwoFactorForAdmin: true });
        await applicant.service.disable('u1', 's1', { password: PASSWORD, code: codeAt(applicant.secret, -1) });
        expect(applicant.user.twoFactorEnabled).toBe(false);
    });
});