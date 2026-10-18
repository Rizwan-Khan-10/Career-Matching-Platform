import { Module } from '@nestjs/common';
import { EventPublisher } from './event-publisher.service';

@Module({ providers: [EventPublisher], exports: [EventPublisher] })
export class EventsModule { }
