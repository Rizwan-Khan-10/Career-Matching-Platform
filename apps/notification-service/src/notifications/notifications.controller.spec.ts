import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsApiService } from './notifications-api.service';
import { NotificationsController } from './notifications.controller';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

const ID = '3f2b8c1e-6d41-4b8e-9c55-0a1b2c3d4e5f';

describe('HTTP API (contract §5.3)', () => {
  let app: INestApplication;
  const api = {
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    unreadCount: jest.fn().mockResolvedValue({ count: 2 }),
    markRead: jest.fn().mockResolvedValue({ id: ID }),
    markAllRead: jest.fn().mockResolvedValue({ updated: 5 }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsApiService, useValue: api }],
    })
      // the JWT itself is the auth module's job; here the guard just puts a user on the request
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => { ctx.switchToHttp().getRequest().user = { userId: 'u1', role: 'APPLICANT' }; return true; } })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('every route sits behind JwtAuthGuard', () => {
    expect(Reflect.getMetadata('__guards__', NotificationsController)).toContain(JwtAuthGuard);
  });

  it('GET /notifications passes limit, cursor and unread=1 (as booleans/numbers) for the JWT user', async () => {
    await request(app.getHttpServer()).get(`/notifications?limit=5&cursor=${ID}&unread=1`).expect(200, { items: [], nextCursor: null });
    expect(api.list).toHaveBeenCalledWith('u1', { limit: 5, cursor: ID, unread: true });
  });

  it('GET /notifications without query uses the service defaults', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(200);
    expect(api.list).toHaveBeenCalledWith('u1', { limit: undefined, cursor: undefined, unread: false });
  });

  it.each(['limit=0', 'limit=51', 'limit=abc', 'cursor=not-a-uuid', 'unread=maybe'])('GET /notifications?%s -> 400', async (query) => {
    await request(app.getHttpServer()).get(`/notifications?${query}`).expect(400);
    expect(api.list).not.toHaveBeenCalled();
  });

  it('GET /notifications/unread-count -> { count }', async () => {
    await request(app.getHttpServer()).get('/notifications/unread-count').expect(200, { count: 2 });
    expect(api.unreadCount).toHaveBeenCalledWith('u1');
  });

  it('PATCH /notifications/:id/read marks one row for the JWT user', async () => {
    await request(app.getHttpServer()).patch(`/notifications/${ID}/read`).expect(200, { id: ID });
    expect(api.markRead).toHaveBeenCalledWith('u1', ID);
  });

  it('PATCH /notifications/not-a-uuid/read -> 400', async () => {
    await request(app.getHttpServer()).patch('/notifications/nope/read').expect(400);
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('PATCH /notifications/read-all is not mistaken for an :id route', async () => {
    await request(app.getHttpServer()).patch('/notifications/read-all').expect(200, { updated: 5 });
    expect(api.markAllRead).toHaveBeenCalledWith('u1');
    expect(api.markRead).not.toHaveBeenCalled();
  });
});