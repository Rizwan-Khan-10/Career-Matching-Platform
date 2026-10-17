import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CHECK_TIMEOUT_MS = 2000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
    return Promise.race([
        work,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS).unref()),
    ]);
}

/** Public (no JWT): used by the Docker HEALTHCHECK. 200 {status:"ok"}; 503 {status:"degraded"} when the DB or Redis is unreachable (contract 3.5). */
@Controller('health')
export class HealthController {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
    ) { }

    @Get()
    async check() {
        const [db, redis] = await Promise.all([
            withTimeout(this.prisma.$queryRaw`SELECT 1`).then(() => 'ok', () => 'down'),
            withTimeout(this.redis.client.ping()).then(() => 'ok', () => 'down'),
        ]);
        if (db !== 'ok' || redis !== 'ok') {
            throw new ServiceUnavailableException({ status: 'degraded', db, redis });
        }
        return { status: 'ok' };
    }
}