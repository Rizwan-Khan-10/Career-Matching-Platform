import { Redis } from 'ioredis';
import { config } from './config';
import { api } from './http';
import { eventually } from './poll';

/** Finds the reset/invite token stored for a user (auth-service keeps it as "reset:<token>" -> userId). */
async function scanForToken(userId: string): Promise<string | null> {
  const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'reset:*', 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        if ((await redis.get(key)) === userId) return key.slice('reset:'.length);
      }
    } while (cursor !== '0');
    return null;
  } finally {
    redis.disconnect();
  }
}

/**
 * The "set your password" link is only e-mailed, so the test takes the token from Redis.
 * If the invite token is not there, forgot-password creates a fresh one for the same user.
 */
export async function setupToken(email: string, userId: string): Promise<string> {
  const existing = await scanForToken(userId);
  if (existing) return existing;
  await api('/auth/forgot-password', { method: 'POST', json: { email } });
  return eventually(`a reset token in Redis for ${email}`, () => scanForToken(userId), { timeoutMs: 30_000, intervalMs: 1000 });
}