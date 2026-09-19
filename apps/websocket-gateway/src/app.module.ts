import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, EventsModule],
})
export class AppModule {}
