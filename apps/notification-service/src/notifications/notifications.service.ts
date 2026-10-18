import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueueService } from '../queue/email-queue.service';
import { EventPublisher } from '../events/event-publisher.service';
import { PlannedNotification } from '../policy/notification-policy';

export const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DeliverResult = 'created' | 'duplicate';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private emails: EmailQueueService,
    private events: EventPublisher,
  ) { }

  /**
   * Writes the row, queues the e-mail the policy asks for and pushes `notification.created`.
   * Safe to call twice with the same event: the second call changes nothing.
   */
  async deliver(plan: PlannedNotification, requestId?: string): Promise<DeliverResult> {
    const existing = await this.prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId: plan.userId, dedupeKey: plan.dedupeKey } },
      select: { id: true },
    });
    if (existing) return 'duplicate';

    // The e-mail goes first, and its jobId makes it idempotent: if saving the row fails the event is retried
    // and the e-mail can neither be lost nor sent twice (a duplicate never reaches this line).
    if (plan.email) await this.emails.enqueue(plan.email);

    const row = await this.insert(plan);
    if (!row) return 'duplicate'; // another instance saved the same event a moment ago

    await this.events.publishCreated(
      plan.userId,
      { id: row.id, type: row.type, title: row.title, body: row.body, data: row.data, readAt: row.readAt, createdAt: row.createdAt },
      requestId,
    );
    return 'created';
  }

  private async insert(plan: PlannedNotification) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId: plan.userId,
          type: plan.type,
          title: plan.title,
          body: plan.body,
          data: plan.data as Prisma.InputJsonObject,
          dedupeKey: plan.dedupeKey,
          expiresAt: new Date(Date.now() + RETENTION_DAYS * DAY_MS),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return null; // unique (userId, dedupeKey)
      throw err;
    }
  }
}
