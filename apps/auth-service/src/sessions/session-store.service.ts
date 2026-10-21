import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** One Redis key per login (device): refresh:<userId>:<sessionId> -> the current refresh token. */
@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(private redis: RedisService) { }

  private key(userId: string, sessionId: string) {
    return `refresh:${userId}:${sessionId}`;
  }

  async save(userId: string, sessionId: string, refreshToken: string): Promise<void> {
    try {
      await this.redis.client.set(this.key(userId, sessionId), refreshToken, 'EX', REFRESH_TOKEN_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`could not store a session: ${(err as Error).message}`);
    }
  }

  async get(userId: string, sessionId: string): Promise<string | null> {
    try {
      return await this.redis.client.get(this.key(userId, sessionId));
    } catch {
      return null;
    }
  }

  /** Logout of one device only. */
  async revoke(userId: string, sessionId: string): Promise<void> {
    try {
      await this.redis.client.del(this.key(userId, sessionId));
    } catch (err) {
      this.logger.warn(`could not delete a session: ${(err as Error).message}`);
    }
  }

  /** Password reset / deactivate / delete: sign the user out everywhere. 2FA on/off keeps the current device. */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    const keep = exceptSessionId ? this.key(userId, exceptSessionId) : null;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', `refresh:${userId}:*`, 'COUNT', 200);
        cursor = next;
        const doomed = keys.filter((k) => k !== keep);
        if (doomed.length > 0) await this.redis.client.del(...doomed);
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`could not delete all sessions of ${userId}: ${(err as Error).message}`);
    }
  }
}