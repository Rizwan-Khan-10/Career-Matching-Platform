import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { StreamsHealthService } from './streams-health.service';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';

@Module({
    imports: [EventsModule, AuditModule],
    controllers: [AdminController],
    providers: [AdminService, StreamsHealthService],
})
export class AdminModule { }