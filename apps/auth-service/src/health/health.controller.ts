import { Controller, Get, HttpException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const PING_TIMEOUT_MS = 2000;

/** Races a dependency check against a timeout; any error or timeout counts as "down". */
async function alive(check: () => PromiseLike<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PING_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  /** 200 {status:'ok'}, or 503 {status:'degraded'} when the database or Redis is down (contract section 3, rule 5). */
  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      alive(() => this.prisma.$queryRaw`SELECT 1`),
      alive(() => this.redis.client.ping()),
    ]);
    const ok = database && redis;
    const body = { status: ok ? 'ok' : 'degraded', service: 'auth-service', checks: { database, redis } };
    if (!ok) throw new HttpException(body, 503);
    return body;
  }
}