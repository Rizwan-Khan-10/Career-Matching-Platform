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
import { assertGoogleAllowed, assertSignupAllowed, resolveCompanyStatus } from './signup-policy';
import axios from 'axios';
import { currentRequestId } from '../common/request-context';
import { TwoFactorService } from './two-factor/two-factor.service';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { GoogleTokenVerifier } from './google-token-verifier';
import { GoogleLoginDto } from './dto/google-login.dto';

// Used when the email does not exist, so that request still pays for one bcrypt compare
// and cannot be told apart from a wrong password by its response time.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

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
    private twoFactor: TwoFactorService,
    private google: GoogleTokenVerifier,
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

    // Always run exactly one bcrypt compare, whether or not the account exists.
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      await this.loginLock.recordFailure(email, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Checked only after the password is right, so a stranger cannot find out which accounts are disabled.
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    await this.loginLock.clear(email, ip);

    // Password was right but the account has 2FA: no tokens yet, only a short-lived challenge.
    if (user.twoFactorEnabled) {
      return { twoFactorRequired: true as const, challengeId: await this.twoFactor.createChallenge(user.id) };
    }

    return this.issueTokens(user.id, user.role); // every login is a new session (device)
  }

  /** Second step of login (also used by Google sign-in in a later batch). */
  async verifyTwoFactor(dto: VerifyTwoFactorDto, ip = 'unknown') {
    const { user, method } = await this.twoFactor.verifyChallenge(dto.challengeId, dto, ip);
    const tokens = await this.issueTokens(user.id, user.role);
    if (method === 'recovery') {
      return { ...tokens, recoveryCodesLeft: await this.twoFactor.recoveryCodesLeft(user.id) };
    }
    return tokens;
  }

  /**
 * Sign in / sign up with a Google ID token. Order matters:
 * 1. the registration mode is checked BEFORE Google is asked anything (college mode = closed),
 * 2. the token must be valid and the e-mail verified by Google,
 * 3. then: already linked -> sign in; same e-mail -> link; nobody -> create (needs a role).
 */
  async googleLogin(dto: GoogleLoginDto) {
    const settings = await this.settings.getAll();
    assertGoogleAllowed(settings);

    const profile = await this.google.verify(dto.credential);
    if (!profile.emailVerified) throw new UnauthorizedException('Invalid Google sign-in');
    const email = profile.email.trim().toLowerCase();

    // 1. this Google account was used before
    const linked = await this.prisma.user.findUnique({ where: { googleId: profile.sub } });
    if (linked) {
      this.assertGoogleUsable(linked);
      return this.finishGoogleLogin(linked);
    }

    // 2. an account with this e-mail exists: link it
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      this.assertGoogleUsable(byEmail);
      if (byEmail.googleId) throw new UnauthorizedException('Invalid credentials'); // tied to another Google account
      if (byEmail.twoFactorEnabled) {
        // Signup does not verify e-mails, so this 2FA could have been set up by someone who pre-registered
        // the address. Linking would keep that person's authenticator on the account: do not link.
        throw new ConflictException({
          code: 'GOOGLE_LINK_BLOCKED',
          message: 'This email already has an account protected by two-factor. Please log in with your email and password.',
        });
      }
      // Signup does not verify e-mails either, so the password may belong to someone who pre-registered
      // this address. Google proves the real owner is here: replace the password and end every session.
      await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: profile.sub, passwordHash: await this.randomPasswordHash() },
      });
      await this.sessions.revokeAll(byEmail.id);
      return this.issueTokens(byEmail.id, byEmail.role);
    }

    // 3. nobody yet: create the account (same rules as signup)
    if (!dto.role) {
      throw new ConflictException({
        code: 'ROLE_REQUIRED',
        message: 'Choose how you will use the platform to finish creating your account.',
      });
    }
    assertSignupAllowed(settings, email);

    let user;
    try {
      user = await this.prisma.user.create({
        data: { email, passwordHash: await this.randomPasswordHash(), role: dto.role, googleId: profile.sub },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Please try again'); // two first logins at once
      throw err;
    }
    await this.createUserProfile(user.id, user.role, user.email, resolveCompanyStatus(settings));
    return this.issueTokens(user.id, user.role);
  }

  private assertGoogleUsable(user: { role: string; isActive: boolean }) {
    // Admins stay on password + 2FA. Same generic message as a failed login.
    if (user.role === 'ADMIN') throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account disabled');
  }

  /** A user who has 2FA still gets the challenge: Google must not skip a protection they chose. */
  private async finishGoogleLogin(user: { id: string; role: string; twoFactorEnabled: boolean }) {
    if (user.twoFactorEnabled) {
      return { twoFactorRequired: true as const, challengeId: await this.twoFactor.createChallenge(user.id) };
    }
    return this.issueTokens(user.id, user.role);
  }

  /** Nobody knows this password. The person can set a real one with "Forgot password". */
  private randomPasswordHash(): Promise<string> {
    return bcrypt.hash(randomBytes(32).toString('hex'), 10);
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