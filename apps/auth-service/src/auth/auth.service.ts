import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import axios from 'axios';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
  ) { }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, role: dto.role },
    });

    this.createUserProfile(user.id, user.role, user.email);

    return this.issueTokens(user.id, user.role);
  }

  async login(dto: LoginDto) {
    const attemptsKey = `login-attempts:${dto.email}`;
    const attempts = await this.safeRedisGet(attemptsKey);
    if (attempts && parseInt(attempts) >= 5) {
      throw new UnauthorizedException('Too many failed attempts. Try again in a few minutes.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.recordFailedAttempt(attemptsKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(attemptsKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    try { await this.redis.client.del(attemptsKey); } catch { }

    return this.issueTokens(user.id, user.role);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; role: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.safeRedisGet(`refresh:${payload.sub}`);
    if (stored !== refreshToken) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    return this.issueTokens(payload.sub, payload.role);
  }

  async logout(userId: string) {
    try { await this.redis.client.del(`refresh:${userId}`); } catch { }
    return { message: 'Logged out' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const resetToken = randomBytes(32).toString('hex');
    try {
      await this.redis.client.set(`reset:${resetToken}`, user.id, 'EX', 15 * 60);
    } catch {
      throw new BadRequestException('Password reset temporarily unavailable, try again shortly');
    }

    // TODO once notification-service's email-queue producer pattern is copied here:
    // push a 'password-reset' job with { email, resetToken } so the actual email gets sent.
    console.log(`Password reset token for ${email}: ${resetToken}`); // temporary, until email wired up

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const userId = await this.safeRedisGet(`reset:${resetToken}`);
    if (!userId) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    try { await this.redis.client.del(`reset:${resetToken}`); } catch { }

    return { message: 'Password updated successfully' };
  }

  private async recordFailedAttempt(key: string) {
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 5 * 60); // 5 min window
    } catch { }
  }

  private async safeRedisGet(key: string): Promise<string | null> {
    try { return await this.redis.client.get(key); } catch { return null; }
  }

  private async issueTokens(userId: string, role: string) {
    const payload = { sub: userId, role };
    const accessToken = this.jwt.sign(payload, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' });

    try {
      await this.redis.client.set(`refresh:${userId}`, refreshToken, 'EX', 7 * 24 * 60 * 60);
    } catch { }

    return { accessToken, refreshToken, role };
  }

  private async createUserProfile(userId: string, role: string, email: string) {
    try {
      await axios.post(`${process.env.USER_SERVICE_URL}/internal/profiles`, {
        userId,
        role,
        email,
      });
    } catch (err: any) {
      console.warn(`Failed to create profile in user-service for ${userId}:`, err?.message || err);
    }
  }
}