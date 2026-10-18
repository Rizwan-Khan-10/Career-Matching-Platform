import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// A user who mistypes locks only their own IP; one attacker cannot lock the real user out.
// The per-email limit still caps an attacker who rotates IPs.
export const LOGIN_LIMITS = {
  perEmailAndIp: { max: 5, windowSeconds: 5 * 60 },
  perEmail: { max: 20, windowSeconds: 15 * 60 },
} as const;

@Injectable()
export class LoginLockService {
  constructor(private redis: RedisService) {}

  private ipKey(email: string, ip: string) {
    return `login-attempts:ip:${email}:${ip}`;
  }

  private emailKey(email: string) {
    return `login-attempts:email:${email}`;
  }

  async isLocked(email: string, ip: string): Promise<boolean> {
    const [ipCount, emailCount] = await Promise.all([
      this.read(this.ipKey(email, ip)),
      this.read(this.emailKey(email)),
    ]);
    return ipCount >= LOGIN_LIMITS.perEmailAndIp.max || emailCount >= LOGIN_LIMITS.perEmail.max;
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await Promise.all([
      this.bump(this.ipKey(email, ip), LOGIN_LIMITS.perEmailAndIp.windowSeconds),
      this.bump(this.emailKey(email), LOGIN_LIMITS.perEmail.windowSeconds),
    ]);
  }

  /** A good login forgives the failures of this email on this IP (the per-email counter just expires). */
  async clear(email: string, ip: string): Promise<void> {
    try {
      await this.redis.client.del(this.ipKey(email, ip));
    } catch { }
  }

  // Redis down = no lock (same fail-open behaviour as before).
  private async read(key: string): Promise<number> {
    try {
      const value = await this.redis.client.get(key);
      return value ? parseInt(value, 10) : 0;
    } catch {
      return 0;
    }
  }

  private async bump(key: string, windowSeconds: number): Promise<void> {
    try {
      const count = await this.redis.client.incr(key);
      // The ttl check repairs a key whose EXPIRE failed earlier; without it the lock would never end.
      if (count === 1 || (await this.redis.client.ttl(key)) < 0) {
        await this.redis.client.expire(key, windowSeconds);
      }
    } catch { }
  }
}