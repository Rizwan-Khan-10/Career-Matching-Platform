import { NotificationsService, RETENTION_DAYS } from './notifications.service';
import { NotificationEventsService } from '../queue/notification-events.service';

/** In-memory Notification table with the real unique (userId, dedupeKey) rule. */
function build() {
  const rows: any[] = [];
  const prisma = {
    notification: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { userId, dedupeKey } = where.userId_dedupeKey;
        return rows.find((r) => r.userId === userId && r.dedupeKey === dedupeKey) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        if (rows.some((r) => r.userId === data.userId && r.dedupeKey === data.dedupeKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { id: `n${rows.length + 1}`, readAt: null, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
    },
  };
  const emails = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const events = { publishCreated: jest.fn().mockResolvedValue(undefined) };
  const notifications = new NotificationsService(prisma as any, emails as any, events as any);
  return { rows, prisma, emails, events, notifications, processor: new NotificationEventsService(notifications) };
}

const eligibleEvent = { applicantId: 'a1', jobRoleId: 'role1', roleTitle: 'Backend Dev', eligible: true, score: 0.8, requestId: 'req-1' };

describe('fake event -> row + push', () => {
  it('match.computed (eligible) writes the row, queues the e-mail and publishes notification.created', async () => {
    const { rows, emails, events, processor } = build();
    await processor.process('match.computed', eligibleEvent, '1-0');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'a1', type: 'match_eligible', dedupeKey: 'a1:role1' });
    expect(rows[0].expiresAt.getTime() - Date.now()).toBeGreaterThan((RETENTION_DAYS - 1) * 24 * 3600 * 1000);
    expect(emails.enqueue).toHaveBeenCalledWith(expect.objectContaining({ name: 'eligibility-result', jobId: 'eligibility-a1-role1' }));
    expect(events.publishCreated).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ id: 'n1', type: 'match_eligible', title: 'You are eligible for a role', readAt: null }),
      'req-1',
    );
  });

  it('resume.parsed writes the "Review and confirm your resume" row and no e-mail', async () => {
    const { rows, emails, events, processor } = build();
    await processor.process('resume.parsed', { resumeId: 'r1', applicantId: 'a1' }, '2-0');

    expect(rows[0]).toMatchObject({ userId: 'a1', type: 'resume_ready', title: 'Review and confirm your resume' });
    expect(emails.enqueue).not.toHaveBeenCalled();
    expect(events.publishCreated).toHaveBeenCalledTimes(1);
  });

  it('match.computed with eligible=false writes nothing, queues nothing, pushes nothing', async () => {
    const { rows, emails, events, processor } = build();
    await processor.process('match.computed', { ...eligibleEvent, eligible: false }, '3-0');

    expect(rows).toHaveLength(0);
    expect(emails.enqueue).not.toHaveBeenCalled();
    expect(events.publishCreated).not.toHaveBeenCalled();
  });

  it('ignores a stream without a policy', async () => {
    const { rows, processor } = build();
    await processor.process('something.else', { applicantId: 'a1' }, '4-0');
    expect(rows).toHaveLength(0);
  });
});

describe('duplicate event -> one row', () => {
  it('the same event twice (even with a new stream id) leaves one row, one e-mail, one push', async () => {
    const { rows, emails, events, processor } = build();
    await processor.process('match.computed', eligibleEvent, '1-0');
    await processor.process('match.computed', eligibleEvent, '1-0'); // redelivery
    await processor.process('match.computed', eligibleEvent, '7-0'); // producer published it again

    expect(rows).toHaveLength(1);
    expect(emails.enqueue).toHaveBeenCalledTimes(1);
    expect(events.publishCreated).toHaveBeenCalledTimes(1);
  });

  it('a lost race (unique violation on insert) is treated as a duplicate: no push', async () => {
    const { prisma, events, processor } = build();
    prisma.notification.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await processor.process('resume.parsed', { resumeId: 'r1', applicantId: 'a1' }, '1-0');
    expect(events.publishCreated).not.toHaveBeenCalled();
  });

  it('two status changes of a company are two notifications', async () => {
    const { rows, processor } = build();
    await processor.process('company.status.changed', { companyId: 'c1', status: 'rejected' }, '5-0');
    await processor.process('company.status.changed', { companyId: 'c1', status: 'approved' }, '6-0');
    await processor.process('company.status.changed', { companyId: 'c1', status: 'approved' }, '6-0'); // redelivery
    expect(rows).toHaveLength(2);
  });
});

describe('failures', () => {
  it('fails (so the consumer retries) when the e-mail cannot be queued, and writes no row yet', async () => {
    const { rows, emails, processor } = build();
    emails.enqueue.mockRejectedValueOnce(new Error('redis down'));
    await expect(processor.process('match.computed', eligibleEvent, '1-0')).rejects.toThrow('redis down');
    expect(rows).toHaveLength(0);

    await processor.process('match.computed', eligibleEvent, '1-0'); // the retry
    expect(rows).toHaveLength(1);
  });

  it('fails when the row cannot be saved', async () => {
    const { prisma, events, processor } = build();
    prisma.notification.create.mockRejectedValueOnce(new Error('db down'));
    await expect(processor.process('resume.parsed', { resumeId: 'r1', applicantId: 'a1' }, '1-0')).rejects.toThrow('db down');
    expect(events.publishCreated).not.toHaveBeenCalled();
  });
});
