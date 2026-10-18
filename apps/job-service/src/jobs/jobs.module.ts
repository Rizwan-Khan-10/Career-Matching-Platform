import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsAdminController } from './jobs-admin.controller';
import { JobsService } from './jobs.service';
import { StorageService } from '../storage/storage.service';
import { CompanyApprovalModule } from '../company-approval/company-approval.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
    imports: [CompanyApprovalModule, SettingsModule],
    controllers: [JobsController, JobsAdminController],
    providers: [JobsService, StorageService],
})
export class JobsModule { }