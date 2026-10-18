import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsApiService } from './notifications-api.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, type: 'resume_ready', title: 't', body: 'b', data: {}, readAt: null, createdAt: new Date(), ...over,
});

function build() {
  const prisma = {
    notification: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { prisma, api: new NotificationsApiService(prisma as any) };
}

describe('NotificationsApiService.list', () => {
  it('scopes to the user, hides expired rows, newest first, default 20 (+1 to detect a next page)', async () => {
    const { prisma, api } = build();
    await api.list('u1', {});
    const args = prisma.notification.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ userId: 'u1', expiresAt: { gt: expect.any(Date) } });
    expect(args.where.readAt).toBeUndefined();
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBe(21);
    expect(args.cursor).toBeUndefined();
  });

  it('returns nextCursor = id of the last item when more rows exist, and drops the extra row', async () => {
    const { prisma, api } = build();
    prisma.notification.findMany.mockResolvedValue([row('n3'), row('n2'), row('n1')]);
    const res = await api.list('u1', { limit: 2 });
    expect(res.items.map((i) => i.id)).toEqual(['n3', 'n2']);
    expect(res.nextCursor).toBe('n2');
  });

  it('nextCursor is null on the last page', async () => {
    const { prisma, api } = build();
    prisma.notification.findMany.mockResolvedValue([row('n2'), row('n1')]);
    expect(await api.list('u1', { limit: 2 })).toMatchObject({ nextCursor: null });
  });

  it('unread=true filters readAt: null', async () => {
    const { prisma, api } = build();
    await api.list('u1', { unread: true });
    expect(prisma.notification.findMany.mock.calls[0][0].where.readAt).toBeNull();
  });

  it('continues after the cursor (skip 1) when the cursor is the user\'s own row', async () => {
    const { prisma, api } = build();
    prisma.notification.findFirst.mockResolvedValue({ id: 'n2' });
    await api.list('u1', { cursor: 'n2' });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: 'n2', userId: 'u1' }, select: { id: true } });
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({ cursor: { id: 'n2' }, skip: 1 });
  });

  it('rejects a cursor that is not the user\'s own row (400)', async () => {
    const { prisma, api } = build();
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(api.list('u1', { cursor: 'someone-elses' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('selects only the public fields', async () => {
    const { prisma, api } = build();
    await api.list('u1', {});
    expect(Object.keys(prisma.notification.findMany.mock.calls[0][0].select).sort()).toEqual(['body', 'createdAt', 'data', 'id', 'readAt', 'title', 'type']);
  });
});

describe('NotificationsApiService counts and reads', () => {
  it('unreadCount counts the user\'s unread, unexpired rows', async () => {
    const { prisma, api } = build();
    prisma.notification.count.mockResolvedValue(4);
    expect(await api.unreadCount('u1')).toEqual({ count: 4 });
    expect(prisma.notification.count.mock.calls[0][0].where).toMatchObject({ userId: 'u1', readAt: null });
  });

  it('markRead sets readAt on the user\'s own unread row', async () => {
    const { prisma, api } = build();
    prisma.notification.findFirst.mockResolvedValue(row('n1'));
    prisma.notification.update.mockResolvedValue(row('n1', { readAt: new Date() }));
    const res = await api.markRead('u1', 'n1');
    expect(prisma.notification.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u1' });
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'n1' }, data: { readAt: expect.any(Date) } }));
    expect(res.readAt).toBeInstanceOf(Date);
  });

  it('markRead twice keeps the first readAt (no second update)', async () => {
    const { prisma, api } = build();
    const first = new Date('2026-01-01');
    prisma.notification.findFirst.mockResolvedValue(row('n1', { readAt: first }));
    expect((await api.markRead('u1', 'n1')).readAt).toBe(first);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('markRead of someone else\'s or a missing id is 404', async () => {
    const { prisma, api } = build();
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(api.markRead('u1', 'n9')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('markAllRead updates only the user\'s unread rows and reports how many', async () => {
    const { prisma, api } = build();
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    expect(await api.markAllRead('u1')).toEqual({ updated: 3 });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', readAt: null });
  });
});