import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from './events.gateway';

const STREAMS = ['resume.parsed', 'jd.extracted', 'match.computed', 'feedback.ready'];

@Injectable()
export class GatewayStreamConsumerService implements OnModuleInit {
    constructor(private redis: RedisService, private gateway: EventsGateway) { }

    async onModuleInit() {
        for (const stream of STREAMS) {
            try {
                await this.redis.client.xgroup('CREATE', stream, 'ws-gateway-group', '0', 'MKSTREAM');
            } catch { }
            this.loop(stream);
        }
    }

    private async loop(stream: string) {
        while (true) {
            try {
                const res = await (this.redis.client as any).xreadgroup(
                    'GROUP', 'ws-gateway-group', `consumer-${stream}`, 'BLOCK', 5000, 'COUNT', 10, 'STREAMS', stream, '>',
                );
                if (res) {
                    for (const [, messages] of res as any) {
                        for (const [id, fields] of messages) {
                            const data = JSON.parse(fields[1]);
                            const userId = data.applicantId || data.companyId;
                            if (userId) this.gateway.pushToUser(userId, stream, data);
                            await this.redis.client.xack(stream, 'ws-gateway-group', id);
                        }
                    }
                }
            } catch {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
    }
}