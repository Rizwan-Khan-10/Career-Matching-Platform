import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from './events.gateway';
import { EventData, GATEWAY_STREAMS, publicPayload, recipientOf } from './gateway-events';
import { requestIdFrom, runWithRequestId } from '../common/request-context';

export const GROUP = 'ws-gateway-group';
const CONSUMER = 'consumer-1';
const MAX_ATTEMPTS = 3; // per delivery
const MAX_DELIVERIES = 5; // a message that keeps coming back is dead-lettered
const BLOCK_MS = 5000;
const RECLAIM_EVERY_MS = 30_000;
const MIN_IDLE_MS = 60_000;

type Entry = [id: string, fields: string[] | null];

const dataField = (fields: string[]): string | undefined => {
    const at = fields.indexOf('data');
    return at >= 0 ? fields[at + 1] : undefined;
};

const parse = (raw: string | undefined): EventData | null => {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as EventData) : null;
    } catch {
        return null;
    }
};

/**
 * Reads the streams of contract section 6 and pushes each event to the room of its recipient.
 * Retry (3 attempts) -> dead-letter `<stream>.dead`; messages that were delivered but never acknowledged are reclaimed
 * with XAUTOCLAIM (contract section 3, rule 4).
 * One consumer group means one gateway instance: with several instances each event would reach only one of them.
 */
@Injectable()
export class GatewayStreamConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(GatewayStreamConsumerService.name);
    private running = false;
    private reader?: Redis;

    constructor(private redis: RedisService, private gateway: EventsGateway) { }

    onModuleInit() {
        this.running = true;
        void this.run(); // not awaited: the gateway accepts connections even while Redis is still coming up
    }

    onModuleDestroy() {
        this.running = false;
        this.reader?.disconnect();
    }

    protected sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * A brand-new group starts at "$": a live push of an old event is useless, so there is no point in replaying history.
     * A group that already exists (BUSYGROUP) is left as it is.
     */
    async ensureGroups(): Promise<void> {
        for (const stream of GATEWAY_STREAMS) {
            try {
                await this.redis.client.xgroup('CREATE', stream, GROUP, '$', 'MKSTREAM');
            } catch (err) {
                if (!String(err).includes('BUSYGROUP')) this.logger.warn(`could not create group on ${stream}: ${(err as Error).message}`);
            }
        }
    }

    private async run() {
        await this.ensureGroups();
        // One blocking read over ALL streams on its own connection. A blocking XREADGROUP holds its connection, so one
        // loop per stream on a shared connection made every stream wait for the others (up to BLOCK_MS each).
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
                    'STREAMS', ...GATEWAY_STREAMS, ...GATEWAY_STREAMS.map(() => '>'),
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

    /**
     * Pushes one event, then acknowledges it. A push that keeps failing is retried 3 times and then dead-lettered.
     * A payload nobody can be addressed with (not JSON, or no applicantId/companyId/userId) is dead-lettered at once.
     */
    async handleMessage(stream: string, id: string, fields: string[]): Promise<void> {
        const requestId = requestIdFrom(parse(dataField(fields))?.requestId);
        return runWithRequestId(requestId, () => this.process(stream, id, fields));
    }

    private async process(stream: string, id: string, fields: string[]): Promise<void> {
        const raw = dataField(fields);
        const data = parse(raw);
        if (!data) return this.deadLetter(stream, id, raw ?? '', 'payload is not a JSON object');

        const userId = recipientOf(data);
        if (!userId) return this.deadLetter(stream, id, raw ?? '', 'no applicantId, companyId or userId in the payload');

        const payload = publicPayload(stream, data);
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                this.gateway.pushToUser(userId, stream, payload);
            } catch (err) {
                lastError = err;
                this.logger.warn(`${stream} ${id} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error)?.message}`);
                if (attempt < MAX_ATTEMPTS) await this.sleep(500 * 2 ** attempt);
                continue;
            }
            // Acknowledged only after the push, and outside the try: a failing XACK must not push the same event
            // again. The message then stays pending and XAUTOCLAIM delivers it once more later.
            await this.redis.client.xack(stream, GROUP, id);
            return;
        }
        await this.deadLetter(stream, id, raw ?? '', lastError);
    }

    /** Picks up messages that were delivered but never acknowledged (the gateway crashed or was stopped mid-way). */
    async reclaimIdle(): Promise<void> {
        for (const stream of GATEWAY_STREAMS) {
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

    private async deadLetter(stream: string, id: string, raw: string, reason: unknown) {
        const error = String((reason as Error)?.message ?? reason).slice(0, 500);
        this.logger.warn(`${stream} ${id} dead-lettered: ${error}`);
        await this.redis.client.xadd(`${stream}.dead`, 'MAXLEN', '~', 10000, '*', 'origId', id, 'error', error, 'data', raw);
        await this.redis.client.xack(stream, GROUP, id); // only after the dead-letter write: if that fails the message stays pending
    }
}