import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { EmailQueueService } from '../queue/email-queue.service';
import { StreamConsumerService } from '../queue/stream-consumer.service';

@Module({
    controllers: [MatchesController],
    providers: [MatchesService, EmailQueueService, StreamConsumerService],
})
export class MatchesModule { }