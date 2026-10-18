import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalCompaniesController } from './internal-companies.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [InternalController, InternalCompaniesController],
})
export class InternalModule { }