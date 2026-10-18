import { EventPublisher } from './event-publisher.service';

function build(xadd = jest.fn().mockResolvedValue('1-0')) {
  return { xadd, publisher: new EventPublisher({ client: { xadd } } as any) };
}

describe('EventPublisher', () => {
  it('writes one "data" field with JSON, trimmed with MAXLEN ~ 10000', async () => {
    const { xadd, publisher } = build();
    await publisher.publish('profile.updated', { applicantId: 'u1' });

    const args = xadd.mock.calls[0];
    expect(args.slice(0, 6)).toEqual(['profile.updated', 'MAXLEN', '~', 10000, '*', 'data']);
    expect(JSON.parse(args[6])).toEqual({ applicantId: 'u1', requestId: expect.any(String) });
  });

  it('keeps a requestId that is already there', async () => {
    const { xadd, publisher } = build();
    await publisher.publish('profile.updated', { applicantId: 'u1', requestId: 'req-1' });
    expect(JSON.parse(xadd.mock.calls[0][6]).requestId).toBe('req-1');
  });

  it('does not throw when Redis is down', async () => {
    const { publisher } = build(jest.fn().mockRejectedValue(new Error('down')));
    await expect(publisher.publish('profile.updated', { applicantId: 'u1' })).resolves.toBeUndefined();
  });
});