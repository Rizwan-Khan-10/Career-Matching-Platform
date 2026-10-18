import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalCompaniesController } from './internal-companies.controller';
import { InternalAuditController } from './internal-audit.controller';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [EventsModule, AuditModule],
  controllers: [InternalController, InternalCompaniesController, InternalAuditController],
})
export class InternalModule { }