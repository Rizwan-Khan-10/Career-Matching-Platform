import { Controller, Get, HttpException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StreamConsumerService } from '../queue/stream-consumer.service';

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
    constructor(private prisma: PrismaService, private redis: RedisService, private consumers: StreamConsumerService) { }

    /** 200 {status:'ok'} or 503 {status:'degraded'} when the database, Redis or a stream consumer loop is down. */
    @Get()
    async check() {
        const [database, redis] = await Promise.all([
            alive(() => this.prisma.$queryRaw`SELECT 1`),
            alive(() => this.redis.client.ping()),
        ]);
        const consumers = this.consumers.status();
        const ok = database && redis && consumers.ok;
        const body = {
            status: ok ? 'ok' : 'degraded',
            service: 'matching-results-service',
            checks: { database, redis, consumers: consumers.ok },
            ...(consumers.ok ? {} : { staleStreams: consumers.stale }),
        };
        if (!ok) throw new HttpException(body, 503);
        return body;
    }
}
