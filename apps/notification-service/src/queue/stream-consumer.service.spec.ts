import { CONSUMED_STREAMS } from '../policy/notification-policy';
import { GROUP, StreamConsumerService } from './stream-consumer.service';

class FastConsumer extends StreamConsumerService {
  protected sleep() { return Promise.resolve(); }
}

function build(call: jest.Mock = jest.fn()) {
  const client = { xack: jest.fn().mockResolvedValue(1), xadd: jest.fn().mockResolvedValue('1-0'), xgroup: jest.fn().mockResolvedValue('OK'), call };
  const events = { process: jest.fn().mockResolvedValue(undefined) };
  return { consumer: new FastConsumer({ client } as any, events as any), client, events };
}

const RAW = '{"applicantId":"a1"}';

describe('StreamConsumerService', () => {
  it('creates the group notification-group on every stream, starting at "$", and ignores BUSYGROUP', async () => {
    const { consumer, client } = build();
    client.xgroup.mockRejectedValueOnce(new Error('BUSYGROUP Consumer Group name already exists'));
    await consumer.ensureGroups();

    expect(client.xgroup).toHaveBeenCalledTimes(CONSUMED_STREAMS.length);
    expect(client.xgroup).toHaveBeenCalledWith('CREATE', 'resume.parsed', GROUP, '$', 'MKSTREAM');
    expect(GROUP).toBe('notification-group');
  });

  it('processes a message and acknowledges it', async () => {
    const { consumer, client, events } = build();
    await consumer.handleMessage('resume.parsed', '1-0', ['data', RAW]);

    expect(events.process).toHaveBeenCalledWith('resume.parsed', { applicantId: 'a1' }, '1-0');
    expect(client.xack).toHaveBeenCalledWith('resume.parsed', GROUP, '1-0');
    expect(client.xadd).not.toHaveBeenCalled();
  });

  it('retries three times, then writes <stream>.dead (with MAXLEN) and acknowledges', async () => {
    const { consumer, client, events } = build();
    events.process.mockRejectedValue(new Error('boom'));
    await consumer.handleMessage('resume.parsed', '1-0', ['data', RAW]);

    expect(events.process).toHaveBeenCalledTimes(3);
    expect(client.xadd).toHaveBeenCalledWith('resume.parsed.dead', 'MAXLEN', '~', 10000, '*', 'origId', '1-0', 'error', 'boom', 'data', RAW);
    expect(client.xack).toHaveBeenCalledWith('resume.parsed', GROUP, '1-0');
  });

  it('succeeds when a later attempt works', async () => {
    const { consumer, client, events } = build();
    events.process.mockRejectedValueOnce(new Error('blip')).mockResolvedValue(undefined);
    await consumer.handleMessage('resume.parsed', '1-0', ['data', RAW]);

    expect(events.process).toHaveBeenCalledTimes(2);
    expect(client.xadd).not.toHaveBeenCalled();
  });

  it('dead-letters a payload that is not a JSON object at once, without retries', async () => {
    const { consumer, client, events } = build();
    await consumer.handleMessage('resume.parsed', '1-0', ['data', 'not json']);
    await consumer.handleMessage('resume.parsed', '2-0', ['data', '[1,2]']);
    await consumer.handleMessage('resume.parsed', '3-0', ['other', 'x']);

    expect(events.process).not.toHaveBeenCalled();
    expect(client.xadd).toHaveBeenCalledTimes(3);
    expect(client.xack).toHaveBeenCalledTimes(3);
  });

  it('keeps the message pending when the dead-letter write itself fails', async () => {
    const { consumer, client, events } = build();
    events.process.mockRejectedValue(new Error('boom'));
    client.xadd.mockRejectedValue(new Error('redis down'));
    await expect(consumer.handleMessage('resume.parsed', '1-0', ['data', RAW])).rejects.toThrow('redis down');
    expect(client.xack).not.toHaveBeenCalled();
  });

  describe('reclaimIdle (XAUTOCLAIM)', () => {
    const callFor = (claimed: unknown[], deliveries = 2) =>
      jest.fn(async (command: string, stream: string) => {
        if (command === 'XAUTOCLAIM') return ['0-0', stream === 'resume.parsed' ? claimed : []];
        if (command === 'XPENDING') return [['9-0', 'consumer-1', 70000, deliveries]];
        return null;
      });

    it('processes idle pending messages', async () => {
      const { consumer, events } = build(callFor([['9-0', ['data', RAW]]]));
      await consumer.reclaimIdle();
      expect(events.process).toHaveBeenCalledWith('resume.parsed', { applicantId: 'a1' }, '9-0');
    });

    it('dead-letters a message delivered more than 5 times without processing it again', async () => {
      const { consumer, client, events } = build(callFor([['9-0', ['data', RAW]]], 6));
      await consumer.reclaimIdle();

      expect(events.process).not.toHaveBeenCalled();
      expect(client.xadd).toHaveBeenCalledWith('resume.parsed.dead', 'MAXLEN', '~', 10000, '*', 'origId', '9-0', 'error', 'too many delivery attempts', 'data', RAW);
      expect(client.xack).toHaveBeenCalledWith('resume.parsed', GROUP, '9-0');
    });

    it('acknowledges an entry that was trimmed away', async () => {
      const { consumer, client, events } = build(callFor([['9-0', null]]));
      await consumer.reclaimIdle();
      expect(events.process).not.toHaveBeenCalled();
      expect(client.xack).toHaveBeenCalledWith('resume.parsed', GROUP, '9-0');
    });

    it('keeps going with the other streams when one of them fails', async () => {
      const call = jest.fn(async (command: string, stream: string) => {
        if (stream === 'resume.parsed') throw new Error('NOGROUP');
        return command === 'XAUTOCLAIM' ? ['0-0', []] : null;
      });
      const { consumer } = build(call);
      await expect(consumer.reclaimIdle()).resolves.toBeUndefined();
      expect(call).toHaveBeenCalledTimes(CONSUMED_STREAMS.length);
    });
  });
});
