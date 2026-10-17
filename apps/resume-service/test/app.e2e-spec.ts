import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from './../src/health/health.controller';
import { PrismaService } from './../src/prisma/prisma.service';
import { RedisService } from './../src/redis/redis.service';

async function appWith(dbOk: boolean, redisOk: boolean) {
  const prisma = { $queryRaw: () => (dbOk ? Promise.resolve([1]) : Promise.reject(new Error('db down'))) };
  const redis = { client: { ping: () => (redisOk ? Promise.resolve('PONG') : Promise.reject(new Error('closed'))) } };
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: RedisService, useValue: redis },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GET /health (e2e, no JWT)', () => {
  let app: INestApplication<App>;
  afterEach(async () => { await app.close(); });

  it('200 {status: ok} when Postgres and Redis answer', async () => {
    app = await appWith(true, true);
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('503 {status: degraded} when a dependency is down', async () => {
    app = await appWith(true, false);
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body.status).toBe('degraded');
  });
});