import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
type RedisProvider = {
  client: Redis;
};

type GatewayProvider = {
  emitToUser(userId: string, event: string, data: unknown): void;
};

const STREAMS = ['resume.parsed', 'match.computed', 'feedback.ready'];
const GROUP = 'websocket-gateway-group'; // matching-agent ke group se alag rakhna

type StreamReply = [string, [string, string[]][]][] | null;

@Injectable()
export class StreamConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamConsumerService.name);
  private consumer!: Redis;
  private running = true;

  constructor(private redis: RedisProvider, private gateway: GatewayProvider) {}

  async onModuleInit() {
    // BLOCK wali read ke liye alag connection, aur reconnect on
    this.consumer = this.redis.client.duplicate({
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    for (const stream of STREAMS) {
      try {
        // '$' = sirf naye events; purane events ka live push me koi matlab nahi
        await this.consumer.xgroup('CREATE', stream, GROUP, '$', 'MKSTREAM');
      } catch { /* group already exists */ }
    }
    void this.loop();
  }

  private async loop() {
    while (this.running) {
      try {
        const res = (await this.consumer.call(
          'XREADGROUP', 'GROUP', GROUP, 'gateway-1',
          'COUNT', 10, 'BLOCK', 5000,
          'STREAMS', ...STREAMS, ...STREAMS.map(() => '>'),
        )) as StreamReply;
        if (!res) continue;

        for (const [stream, messages] of res) {
          for (const [id, fields] of messages) {
            try {
              const data = JSON.parse(fields[1]);
              const userId = data.userId ?? data.applicantId;
              if (userId) this.gateway.emitToUser(userId, stream, data);
            } catch (e) {
              this.logger.warn(`Bad message ${id} on ${stream}: ${(e as Error).message}`);
            }
            await this.consumer.xack(stream, GROUP, id);
          }
        }
      } catch {
        if (this.running) await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  onModuleDestroy() {
    this.running = false;
    this.consumer?.disconnect();
  }
}