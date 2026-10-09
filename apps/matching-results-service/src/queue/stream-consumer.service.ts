import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MatchesService } from '../matches/matches.service';

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    private readonly logger = new Logger(StreamConsumerService.name);

    constructor(private redis: RedisService, private matches: MatchesService) { }

    async onModuleInit() {
        await this.ensureGroup('match.computed', 'matching-results-group');
        await this.ensureGroup('feedback.ready', 'matching-results-group');
        await this.ensureGroup('job.role.deleted', 'matching-results-group');
        this.loop('job.role.deleted', 'matching-results-group', (data) => this.matches.deleteForRole(data.roleId));
        await this.ensureGroup('resume.pdf.ready', 'matching-results-group');
        await this.ensureGroup('resume.pdf.failed', 'matching-results-group');
        this.loop('resume.pdf.ready', 'matching-results-group', (data) => this.matches.onResumePdfReady(data));
        this.loop('resume.pdf.failed', 'matching-results-group', (data) => this.matches.onResumePdfFailed(data));
        await this.ensureGroup('match.scanned', 'matching-results-group');
        this.loop('match.scanned', 'matching-results-group', (data) => this.matches.saveScans(data));
        this.loop('match.computed', 'matching-results-group', (data) => this.matches.saveMatchResult(data));
        this.loop('feedback.ready', 'matching-results-group', (data) => this.matches.saveFeedback(data));
    }

    private async ensureGroup(stream: string, group: string) {
        try {
            await this.redis.client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
        } catch { }
    }

    /** Retries a message a few times; if it still fails it goes to `<stream>.dead` so it can never block or vanish silently. */
    private async handleWithRetry(stream: string, group: string, id: string, fields: string[], handler: (data: any) => Promise<any>) {
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                await handler(JSON.parse(fields[1]));
                await this.redis.client.xack(stream, group, id);
                return;
            } catch (err) {
                lastError = err;
                this.logger.warn(`${stream} ${id} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error)?.message}`);
                if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** attempt);
            }
        }
        await this.redis.client.xadd(`${stream}.dead`, '*', 'origId', id, 'error', String((lastError as Error)?.message ?? lastError).slice(0, 500), 'data', fields[1] ?? '');
        await this.redis.client.xack(stream, group, id);
    }

    private async loop(stream: string, group: string, handler: (data: any) => Promise<any>) {
        while (true) {
            try {
                const res = await (this.redis.client as any).xreadgroup(
                    'GROUP', group, `consumer-${stream}`, 'BLOCK', 5000, 'COUNT', 10, 'STREAMS', stream, '>',
                );
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