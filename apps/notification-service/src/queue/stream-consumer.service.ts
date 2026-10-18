import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { CONSUMED_STREAMS, EventData } from '../policy/notification-policy';
import { NotificationEventsService } from './notification-events.service';

export const GROUP = 'notification-group';
const CONSUMER = 'consumer-1';
const MAX_ATTEMPTS = 3; // per delivery
const MAX_DELIVERIES = 5; // a message that keeps killing the process is dead-lettered
const BLOCK_MS = 5000;
const RECLAIM_EVERY_MS = 30_000;
const MIN_IDLE_MS = 60_000;

type Entry = [id: string, fields: string[] | null];

const dataField = (fields: string[]): string | undefined => {
  const at = fields.indexOf('data');
  return at >= 0 ? fields[at + 1] : undefined;
};

@Injectable()
export class StreamConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamConsumerService.name);
  private running = false;
  private reader?: Redis;

  constructor(
    private redis: RedisService,
    private events: NotificationEventsService,
  ) { }

  onModuleInit() {
    this.running = true;
    void this.run(); // not awaited: the service starts even while Redis is still coming up
  }

  onModuleDestroy() {
    this.running = false;
    this.reader?.disconnect();
  }

  protected sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * A brand-new group starts at "$" (new events only). Starting at "0" would replay the whole history of every
   * stream and e-mail people about matches they heard about long ago.
   */
  async ensureGroups(): Promise<void> {
    for (const stream of CONSUMED_STREAMS) {
      try {
        await this.redis.client.xgroup('CREATE', stream, GROUP, '$', 'MKSTREAM');
      } catch (err) {
        if (!String(err).includes('BUSYGROUP')) this.logger.warn(`could not create group on ${stream}: ${(err as Error).message}`);
      }
    }
  }

  private async run() {
    await this.ensureGroups();
    // One blocking read over ALL streams on its own connection. A blocking XREADGROUP holds its connection,
    // so sharing one with other commands (or running one loop per stream on it) would delay events by many seconds.
    this.reader = this.redis.client.duplicate();
    let lastReclaim = 0;

    while (this.running) {
      try {
        if (Date.now() - lastReclaim >= RECLAIM_EVERY_MS) {
          lastReclaim = Date.now();
          await this.reclaimIdle();
        }
        const res = (await this.reader.call(
          'XREADGROUP', 'GROUP', GROUP, CONSUMER, 'COUNT', 10, 'BLOCK', BLOCK_MS,
          'STREAMS', ...CONSUMED_STREAMS, ...CONSUMED_STREAMS.map(() => '>'),
        )) as [string, Entry[]][] | null;

        for (const [stream, entries] of res ?? []) {
          for (const [id, fields] of entries) {
            if (fields) await this.handleMessage(stream, id, fields);
          }
        }
      } catch (err) {
        if (!this.running) break;
        this.logger.error(`consumer loop error: ${(err as Error).message}`);
        if (String(err).includes('NOGROUP')) await this.ensureGroups();
        await this.sleep(2000);
      }
    }
  }

  /** Retries 3 times; if it still fails the message goes to `<stream>.dead` and is acknowledged. */
  async handleMessage(stream: string, id: string, fields: string[]): Promise<void> {
    const raw = dataField(fields);
    const data = this.parse(raw);
    if (!data) return this.deadLetter(stream, id, raw ?? '', 'payload is not a JSON object');

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.events.process(stream, data, id);
        await this.redis.client.xack(stream, GROUP, id);
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(`${stream} ${id} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error)?.message}`);
        if (attempt < MAX_ATTEMPTS) await this.sleep(500 * 2 ** attempt);
      }
    }
    await this.deadLetter(stream, id, raw ?? '', lastError);
  }

  /** Picks up messages that were delivered but never acknowledged (the service crashed or was stopped mid-way). */
  async reclaimIdle(): Promise<void> {
    for (const stream of CONSUMED_STREAMS) {
      try {
        let cursor = '0-0';
        do {
          const res = (await this.redis.client.call(
            'XAUTOCLAIM', stream, GROUP, CONSUMER, MIN_IDLE_MS, cursor, 'COUNT', 10,
          )) as [string, Entry[]];
          cursor = res[0];
          for (const [id, fields] of res[1] ?? []) await this.reprocess(stream, id, fields);
        } while (cursor !== '0-0');
      } catch (err) {
        this.logger.warn(`could not reclaim ${stream}: ${(err as Error).message}`);
      }
    }
  }

  private async reprocess(stream: string, id: string, fields: string[] | null) {
    if (!fields) {
      await this.redis.client.xack(stream, GROUP, id); // the entry was trimmed away
      return;
    }
    if ((await this.deliveries(stream, id)) > MAX_DELIVERIES) {
      await this.deadLetter(stream, id, dataField(fields) ?? '', 'too many delivery attempts');
      return;
    }
    await this.handleMessage(stream, id, fields);
  }

  private async deliveries(stream: string, id: string): Promise<number> {
    const rows = (await this.redis.client.call('XPENDING', stream, GROUP, id, id, 1)) as [string, string, number, number][];
    return Number(rows?.[0]?.[3] ?? 0);
  }

  private parse(raw: string | undefined): EventData | null {
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as EventData) : null;
    } catch {
      return null;
    }
  }

  private async deadLetter(stream: string, id: string, raw: string, reason: unknown) {
    const error = String((reason as Error)?.message ?? reason).slice(0, 500);
    await this.redis.client.xadd(`${stream}.dead`, 'MAXLEN', '~', 10000, '*', 'origId', id, 'error', error, 'data', raw);
    await this.redis.client.xack(stream, GROUP, id); // only after the dead-letter write: if that fails the message stays pending
  }
}
