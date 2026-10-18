import { Controller, Get, HttpException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
    constructor(private redis: RedisService) { }

    /** 200 {status:'ok'}, or 503 {status:'degraded'} when Redis is down (contract section 3, rules 5 and 8). */
    @Get()
    async check() {
        const redis = await alive(() => this.redis.client.ping());
        const body = { status: redis ? 'ok' : 'degraded', service: 'websocket-gateway', checks: { redis } };
        if (!redis) throw new HttpException(body, 503);
        return body;
    }
}