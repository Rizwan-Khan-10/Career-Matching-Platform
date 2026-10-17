import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MatchesService } from '../matches/matches.service';
import { STREAM_MAXLEN } from '../common/events';
import { newRequestId, runWithRequestId } from '../common/request-context';

const GROUP = 'matching-results-group';
const MAX_ATTEMPTS = 3;
/** A pending message nobody acknowledged for this long belongs to a consumer that crashed: another read takes it over. */
const RECLAIM_IDLE_MS = 60_000;
const RECLAIM_EVERY_MS = 30_000;
const RECLAIM_BATCH = 10;
const RECLAIM_MAX_PAGES = 20;
/** A stream whose loop has not completed a read for this long counts as dead (GET /health -> 503). */
const STALE_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class StreamConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(StreamConsumerService.name);
    private running = true;
    private readonly lastBeat = new Map<string, number>();
    /** wait between attempts; tests replace it */
    protected backoffMs = (attempt: number) => 500 * 2 ** attempt;

    constructor(private redis: RedisService, private matches: MatchesService) { }

    async onModuleInit() {
        const handlers: [string, (data: any) => Promise<any>][] = [
            ['match.computed', (d) => this.matches.saveMatchResult(d)],
            ['match.scanned', (d) => this.matches.saveScans(d)],
            ['feedback.ready', (d) => this.matches.saveFeedback(d)],
            ['job.role.deleted', (d) => this.matches.deleteForRole(d.roleId)],
            ['resume.pdf.ready', (d) => this.matches.onResumePdfReady(d)],
            ['resume.pdf.failed', (d) => this.matches.onResumePdfFailed(d)],
            ['resume.superseded', (d) => this.matches.onResumeRemoved(d)],
            ['resume.deleted', (d) => this.matches.onResumeRemoved(d)],
            ['prep.ready', (d) => this.matches.savePrepGuide(d)],
            ['rejection-feedback.ready', (d) => this.matches.saveRejectionFeedback(d)],
        ];
        for (const [stream, handler] of handlers) {
            await this.ensureGroup(stream, GROUP);
            this.lastBeat.set(stream, Date.now());
            void this.loop(stream, GROUP, handler);
        }
    }

    onModuleDestroy() {
        this.running = false;
    }

    /** For GET /health: the streams whose consumer loop has stopped completing reads. */
    status(): { ok: boolean; stale: string[] } {
        const now = Date.now();
        const stale = [...this.lastBeat].filter(([, at]) => now - at > STALE_MS).map(([stream]) => stream);
        return { ok: stale.length === 0, stale };
    }

    private async ensureGroup(stream: string, group: string) {
        try {
            await this.redis.client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
        } catch { }
    }

    /**
     * Runs the handler with the event's requestId in scope (logs and events published meanwhile carry it), retries a
     * few times, and if it still fails moves the message to `<stream>.dead` so it can never block or vanish
     * silently. The message is always acknowledged at the end.
     */
    async handleWithRetry(stream: string, group: string, id: string, fields: string[], handler: (data: any) => Promise<any>) {
        let data: any;
        try {
            data = JSON.parse(fields[1]);
        } catch { }
        const requestId = typeof data?.requestId === 'string' && data.requestId ? data.requestId : newRequestId();

        await runWithRequestId(requestId, async () => {
            if (data === undefined) {
                await this.deadLetter(stream, group, id, fields, new Error('payload is not valid JSON'));
                return;
            }
            let lastError: unknown;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    await handler(data);
                    await this.redis.client.xack(stream, group, id);
                    return;
                } catch (err) {
                    lastError = err;
                    this.logger.warn(`${stream} ${id} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error)?.message}`);
                    if (attempt < MAX_ATTEMPTS) await sleep(this.backoffMs(attempt));
                }
            }
            await this.deadLetter(stream, group, id, fields, lastError);
        });
    }

    private async deadLetter(stream: string, group: string, id: string, fields: string[], error: unknown) {
        const message = String((error as Error)?.message ?? error).slice(0, 500);
        this.logger.error(`${stream} ${id} moved to ${stream}.dead: ${message}`);
        await this.redis.client.xadd(`${stream}.dead`, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'origId', id, 'error', message, 'data', fields?.[1] ?? '');
        await this.redis.client.xack(stream, group, id);
    }

    /**
     * XAUTOCLAIM: takes over messages that were delivered to a consumer that never acknowledged them (crash, restart
     * in the middle of a handler) and runs them through the normal retry / dead-letter path.
     * An entry that was trimmed away by MAXLEN while still pending comes back without fields: just acknowledge it.
     */
    async reclaimIdle(stream: string, group: string, consumer: string, handler: (data: any) => Promise<any>) {
        let cursor = '0-0';
        for (let page = 0; page < RECLAIM_MAX_PAGES; page++) {
            const res: any = await (this.redis.client as any).xautoclaim(stream, group, consumer, RECLAIM_IDLE_MS, cursor, 'COUNT', RECLAIM_BATCH);
            cursor = res?.[0] ?? '0-0';
            for (const [id, fields] of (res?.[1] ?? []) as [string, string[] | null][]) {
                if (!fields) {
                    await this.redis.client.xack(stream, group, id);
                    continue;
                }
                this.logger.warn(`${stream} ${id} reclaimed after being idle`);
                await this.handleWithRetry(stream, group, id, fields, handler);
            }
            if (cursor === '0-0') return;
        }
    }

    private async loop(stream: string, group: string, handler: (data: any) => Promise<any>) {
        const consumer = `consumer-${stream}`;
        let lastReclaim = 0;
        while (this.running) {
            try {
                if (Date.now() - lastReclaim >= RECLAIM_EVERY_MS) {
                    lastReclaim = Date.now();
                    await this.reclaimIdle(stream, group, consumer, handler);
                }
                const res = await (this.redis.client as any).xreadgroup(
                    'GROUP', group, consumer, 'BLOCK', 5000, 'COUNT', 10, 'STREAMS', stream, '>',
                );
                this.lastBeat.set(stream, Date.now());
                if (res) {
                    for (const [, messages] of res as any) {
                        for (const [id, fields] of messages) {
                            await this.handleWithRetry(stream, group, id, fields, handler);
                        }
                    }
                }
            } catch (err) {
                this.logger.error(`stream loop error (${stream}): ${(err as Error)?.message}`);
                await sleep(2000);
            }
        }
    }
}
