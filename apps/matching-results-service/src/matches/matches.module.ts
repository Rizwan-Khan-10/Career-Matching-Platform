import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { EmailQueueService } from '../queue/email-queue.service';
import { StreamConsumerService } from '../queue/stream-consumer.service';

@Module({
    controllers: [MatchesController, StatsController],
    providers: [MatchesService, StatsService, EmailQueueService, StreamConsumerService],
})
export class MatchesModule { }