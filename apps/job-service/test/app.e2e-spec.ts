import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// needs a real Postgres (DATABASE_URL) and Redis; run it locally with `pnpm test:e2e`, CI only builds
describe('job-service (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) answers with a status', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(['ok', 'degraded']).toContain(res.body.status);
  });

  it('/jobs/mine (GET) needs a token', () => {
    return request(app.getHttpServer()).get('/jobs/mine').expect(401);
  });

  it('/jobs/admin/pending (GET) needs a token', () => {
    return request(app.getHttpServer()).get('/jobs/admin/pending').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
