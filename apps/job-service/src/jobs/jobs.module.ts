import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { StorageService } from '../storage/storage.service';
import { CompanyApprovalModule } from '../company-approval/company-approval.module';

@Module({ imports: [CompanyApprovalModule], controllers: [JobsController], providers: [JobsService, StorageService] })
export class JobsModule { }