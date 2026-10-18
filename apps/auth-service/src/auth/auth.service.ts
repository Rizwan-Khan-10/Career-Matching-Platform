import { Injectable, ConflictException, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { MailQueueService } from '../mail/mail-queue.service'
import { SettingsService } from '../settings/settings.service';
import { SessionStore } from '../sessions/session-store.service';
import { LoginLockService } from './login-lock.service';
import { assertSignupAllowed, resolveCompanyStatus } from './signup-policy';
import axios from 'axios';
import { currentRequestId } from '../common/request-context';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
    private mail: MailQueueService,
    private settings: SettingsService,
    private sessions: SessionStore,
    private loginLock: LoginLockService,
  ) { }

  async signup(dto: SignupDto) {
    // Registration mode is enforced here on the server, before anything else happens.
    const settings = await this.settings.getAll();
    assertSignupAllowed(settings, dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, role: dto.role },
    });

    // Awaited on purpose: the company status (pending/approved) must be stored before the
    // web app asks for the profile. Failure is still best-effort (logged), as before.
    await this.createUserProfile(user.id, user.role, user.email, resolveCompanyStatus(settings));

    return this.issueTokens(user.id, user.role);
  }

  async login(dto: LoginDto, ip = 'unknown') {
    // Accounts are stored lower-case; normalizing here also stops "A@x.com" from dodging the lock.
    const email = dto.email.trim().toLowerCase();

    if (await this.loginLock.isLocked(email, ip)) {
      throw new UnauthorizedException('Too many failed attempts. Try again in a few minutes.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.loginLock.recordFailure(email, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.loginLock.recordFailure(email, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Checked only after the password is right, so a stranger cannot find out which accounts are disabled.
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    await this.loginLock.clear(email, ip);

    return this.issueTokens(user.id, user.role); // every login is a new session (device)
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; role: string; sid?: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    // Tokens issued before per-device sessions carry no session id: they must log in again once.
    if (!payload.sid) throw new UnauthorizedException('Invalid or expired refresh token');

    const stored = await this.sessions.get(payload.sub, payload.sid);
    if (stored !== refreshToken) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Invalid or expired refresh token');
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    return this.issueTokens(user.id, user.role, payload.sid); // same device, same session id
  }

  /** Ends only the session this access token belongs to; other devices stay logged in. */
  async logout(userId: string, sessionId?: string) {
    if (sessionId) await this.sessions.revoke(userId, sessionId);
    return { message: 'Logged out' };
  }

  async forgotPassword(email: string) {
    const generic = { message: 'If that email exists, a reset link has been sent.' };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return generic;

    const resetToken = randomBytes(32).toString('hex');
    try {
      await this.redis.client.set(`reset:${resetToken}`, user.id, 'EX', 15 * 60);
    } catch {
      throw new BadRequestException('Password reset temporarily unavailable, try again shortly');
    }
    try {
      await this.mail.enqueuePasswordReset(user.email, resetToken);
    } catch (err) {
      this.logger.error(`could not queue the password-reset e-mail: ${(err as Error).message}`); // never log the token itself
    }
    return generic;
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const userId = await this.safeRedisGet(`reset:${resetToken}`);
    if (!userId) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    try { await this.redis.client.del(`reset:${resetToken}`); } catch { }
    await this.sessions.revokeAll(userId); // a reset must sign out every device
    return { message: 'Password updated successfully' };
  }

  private async safeRedisGet(key: string): Promise<string | null> {
    try { return await this.redis.client.get(key); } catch { return null; }
  }

  private async issueTokens(userId: string, role: string, sessionId: string = randomUUID()) {
    const payload = { sub: userId, role, sid: sessionId };
    const accessToken = this.jwt.sign(payload, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' });

    await this.sessions.save(userId, sessionId, refreshToken);

    return { accessToken, refreshToken, role };
  }

  private async createUserProfile(
    userId: string,
    role: string,
    email: string,
    companyStatus: 'pending' | 'approved',
  ) {
    try {
      await axios.post(
        `${process.env.USER_SERVICE_URL}/internal/profiles`,
        { userId, role, email, companyStatus },
        {
          headers: {
            'x-internal-key': process.env.INTERNAL_API_KEY,
            ...(currentRequestId() ? { 'x-request-id': currentRequestId() } : {}),
          },
          timeout: 5000,
        },
      );
    } catch (err: any) {
      this.logger.warn(`Failed to create profile in user-service for ${userId}: ${err?.message || err}`);
    }
  }
}