import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_LIMIT } from './dto/list-notifications.dto';

/** Contract §5.3: `Notification` = { id, type, title, body, data, readAt, createdAt }. Nothing else leaves the service. */
const PUBLIC = { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true } as const;

/** Every query is scoped to `userId` (taken from the JWT): a user can only ever see or change their own rows. */
@Injectable()
export class NotificationsApiService {
  constructor(private prisma: PrismaService) { }

  async list(userId: string, opts: { limit?: number; cursor?: string; unread?: boolean }) {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    if (opts.cursor) {
      const known = await this.prisma.notification.findFirst({ where: { id: opts.cursor, userId }, select: { id: true } });
      if (!known) throw new BadRequestException('Invalid cursor');
    }

    // one extra row tells us whether another page exists
    const rows = await this.prisma.notification.findMany({
      where: { userId, expiresAt: { gt: new Date() }, ...(opts.unread ? { readAt: null } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: PUBLIC,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null, expiresAt: { gt: new Date() } } });
    return { count };
  }

  /** Idempotent: reading twice keeps the first `readAt`. Someone else's id looks exactly like a missing one (404). */
  async markRead(userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({ where: { id, userId }, select: PUBLIC });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.readAt) return row;
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() }, select: PUBLIC });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, expiresAt: { gt: new Date() } },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}