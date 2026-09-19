import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MatchesService } from '../matches/matches.service';

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    constructor(private redis: RedisService, private matches: MatchesService) { }

    async onModuleInit() {
        await this.ensureGroup('match.computed', 'matching-results-group');
        await this.ensureGroup('feedback.ready', 'matching-results-group');
        this.loop('match.computed', 'matching-results-group', (data) => this.matches.saveMatchResult(data));
        this.loop('feedback.ready', 'matching-results-group', (data) => this.matches.saveFeedback(data));
    }

    private async ensureGroup(stream: string, group: string) {
        try {
            await this.redis.client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
        } catch { }
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
                            const data = JSON.parse(fields[1]);
                            await handler(data);
                            await this.redis.client.xack(stream, group, id);
                        }
                    }
                }
            } catch {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
    }
}