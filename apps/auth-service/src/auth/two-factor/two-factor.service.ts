import {
    BadRequestException,
    ConflictException,
    Injectable,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SessionStore } from '../../sessions/session-store.service';
import { RateLimitService } from '../rate-limit.service';
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from './totp';
import { decryptSecret, encryptSecret, isEncryptionConfigured } from './secret-crypto';

export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const MAX_WRONG_CODES = 5;
export const LOCK_SECONDS = 5 * 60;

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/i/l, easy to read out loud
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 10;

export interface SecondFactorInput {
    code?: string;
    recoveryCode?: string;
}
type Factor = 'totp' | 'recovery';

@Injectable()
export class TwoFactorService {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private sessions: SessionStore,
        private rateLimit: RateLimitService,
    ) { }

    // ---------- settings screen (user is logged in) ----------

    async status(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });
        const enabled = !!user?.twoFactorEnabled;
        return { enabled, recoveryCodesLeft: enabled ? await this.recoveryCodesLeft(userId) : 0 };
    }

    /** Step 1: make a secret, keep it encrypted and NOT enabled until the user proves they scanned it. */
    async setup(userId: string) {
        this.requireConfigured();
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, twoFactorEnabled: true },
        });
        if (!user) throw new UnauthorizedException();
        if (user.twoFactorEnabled) throw new ConflictException('Two-factor is already turned on');

        const secret = generateTotpSecret();
        await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: encryptSecret(secret) } });
        const issuer = process.env.TWO_FACTOR_ISSUER || 'CareerMatch';
        return { otpauthUrl: buildOtpauthUrl(secret, user.email, issuer), secret };
    }

    /** Step 2: the user types a code from the app. Shows the recovery codes once. */
    async enable(userId: string, sessionId: string | undefined, code: string) {
        this.requireConfigured();
        await this.limitConfirmations(userId);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
        });
        if (!user) throw new UnauthorizedException();
        if (user.twoFactorEnabled) throw new ConflictException('Two-factor is already turned on');
        if (!user.twoFactorSecret) throw new BadRequestException('Start the setup first');

        const ok = await this.consumeTotp(userId, decryptSecret(user.twoFactorSecret), code);
        if (!ok) throw new BadRequestException('Invalid code');

        const { plain, hashes } = await this.newRecoveryCodes();
        await this.prisma.$transaction([
            this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } }),
            this.prisma.recoveryCode.deleteMany({ where: { userId } }),
            this.prisma.recoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) }),
        ]);
        // other devices were signed in before 2FA existed on this account
        await this.sessions.revokeAll(userId, sessionId);
        return { recoveryCodes: plain };
    }

    async disable(userId: string, sessionId: string | undefined, input: SecondFactorInput & { password: string }) {
        await this.requireStrongProof(userId, input);
        await this.prisma.$transaction([
            this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } }),
            this.prisma.recoveryCode.deleteMany({ where: { userId } }),
        ]);
        await this.sessions.revokeAll(userId, sessionId);
        return { enabled: false };
    }

    async regenerateRecoveryCodes(userId: string, input: SecondFactorInput & { password: string }) {
        await this.requireStrongProof(userId, input);
        const { plain, hashes } = await this.newRecoveryCodes();
        await this.prisma.$transaction([
            this.prisma.recoveryCode.deleteMany({ where: { userId } }),
            this.prisma.recoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) }),
        ]);
        return { recoveryCodes: plain };
    }

    // ---------- login (public, no tokens yet) ----------

    /** Opaque random id in Redis, NOT a JWT: all services share JWT_SECRET, so a "half-logged-in" JWT could pass elsewhere. */
    async createChallenge(userId: string): Promise<string> {
        const id = randomBytes(24).toString('base64url');
        await this.redis.client.set(`2fa:chal:${id}`, userId, 'EX', CHALLENGE_TTL_SECONDS);
        return id;
    }

    async verifyChallenge(challengeId: string, input: SecondFactorInput, ip: string) {
        this.requireConfigured();
        await this.rateLimit.assert('2fa-verify-ip', ip, 30, 5 * 60, 'Too many attempts. Try again in a few minutes.');

        const challengeKey = `2fa:chal:${challengeId}`;
        const failKey = `2fa:fail:${challengeId}`;
        const expired = () => new UnauthorizedException('Login session expired. Please sign in again.');

        const userId = await this.redis.client.get(challengeKey);
        if (!userId) throw expired();

        if (await this.redis.client.get(`2fa:lock:${userId}`)) {
            throw new UnauthorizedException('Too many wrong codes. Try again in a few minutes.');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, isActive: true, twoFactorEnabled: true, twoFactorSecret: true },
        });
        if (!user || !user.twoFactorEnabled || !user.isActive) {
            await this.redis.client.del(challengeKey);
            throw expired();
        }

        const method = await this.checkSecondFactor(user, input);
        if (!method) {
            const fails = await this.redis.client.incr(failKey);
            if (fails === 1) await this.redis.client.expire(failKey, CHALLENGE_TTL_SECONDS);
            if (fails >= MAX_WRONG_CODES) {
                await this.redis.client.del(challengeKey, failKey);
                await this.redis.client.set(`2fa:lock:${userId}`, '1', 'EX', LOCK_SECONDS);
            }
            throw new UnauthorizedException('Invalid code');
        }

        await this.redis.client.del(challengeKey, failKey); // a challenge works once
        return { user, method };
    }

    async recoveryCodesLeft(userId: string): Promise<number> {
        return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
    }

    // ---------- internals ----------

    private requireConfigured() {
        if (!isEncryptionConfigured()) {
            throw new ServiceUnavailableException('Two-factor is not configured on the server');
        }
    }

    private limitConfirmations(userId: string) {
        return this.rateLimit.assert('2fa-confirm', userId, 10, 5 * 60, 'Too many attempts. Try again in a few minutes.');
    }

    /** disable / new recovery codes: needs the password AND a current code (or a recovery code). */
    private async requireStrongProof(userId: string, input: SecondFactorInput & { password: string }) {
        this.requireConfigured();
        await this.limitConfirmations(userId);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true },
        });
        if (!user) throw new UnauthorizedException();
        if (!user.twoFactorEnabled) throw new BadRequestException('Two-factor is not turned on');

        // 400 (not 401) on purpose: the web app treats 401 on a logged-in call as "session expired".
        if (!(await bcrypt.compare(input.password, user.passwordHash))) throw new BadRequestException('Incorrect password');
        if (!(await this.checkSecondFactor(user, input))) throw new BadRequestException('Invalid code');
    }

    private async checkSecondFactor(
        user: { id: string; twoFactorSecret: string | null },
        input: SecondFactorInput,
    ): Promise<Factor | null> {
        if (input.code) {
            if (!user.twoFactorSecret) return null;
            return (await this.consumeTotp(user.id, decryptSecret(user.twoFactorSecret), input.code)) ? 'totp' : null;
        }
        if (input.recoveryCode) {
            return (await this.consumeRecoveryCode(user.id, input.recoveryCode)) ? 'recovery' : null;
        }
        return null;
    }

    /** A code is good once: remember the matched time step for 90 s (NX = only if nobody used it yet). */
    private async consumeTotp(userId: string, secret: string, code: string): Promise<boolean> {
        const step = verifyTotp(secret, code);
        if (step === null) return false;
        const fresh = await this.redis.client.set(`2fa:used:${userId}:${step}`, '1', 'EX', 90, 'NX');
        return fresh === 'OK';
    }

    private normalizeRecovery(input: string) {
        return input.toLowerCase().replace(/[\s-]/g, '');
    }

    private async consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
        const normalized = this.normalizeRecovery(input);
        if (normalized.length !== 10) return false;

        const candidates = await this.prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
        for (const candidate of candidates) {
            if (await bcrypt.compare(normalized, candidate.codeHash)) {
                // updateMany with usedAt:null makes the "use" atomic, two parallel requests cannot both win
                const result = await this.prisma.recoveryCode.updateMany({
                    where: { id: candidate.id, usedAt: null },
                    data: { usedAt: new Date() },
                });
                return result.count === 1;
            }
        }
        return false;
    }

    private async newRecoveryCodes() {
        const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
            const raw = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
            return `${raw.slice(0, 5)}-${raw.slice(5)}`;
        });
        const hashes = await Promise.all(plain.map((c) => bcrypt.hash(this.normalizeRecovery(c), BCRYPT_ROUNDS)));
        return { plain, hashes };
    }
}