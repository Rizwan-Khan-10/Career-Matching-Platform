import { Module } from '@nestjs/common';
import { ApplicantsController } from './applicants.controller';
import { ApplicantsService } from './applicants.service';
import { StorageService } from '../storage/storage.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ApplicantsController],
  providers: [ApplicantsService, StorageService],
})
export class ApplicantsModule { }