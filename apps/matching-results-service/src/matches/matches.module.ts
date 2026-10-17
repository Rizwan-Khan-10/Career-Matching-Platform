import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { StreamConsumerService } from '../queue/stream-consumer.service';

@Module({
    controllers: [MatchesController, StatsController],
    providers: [MatchesService, StatsService, StreamConsumerService],
    exports: [StreamConsumerService], // GET /health reads the consumer status
})
export class MatchesModule { }