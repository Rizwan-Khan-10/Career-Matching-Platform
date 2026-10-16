import { Module } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { StorageService } from '../storage/storage.service';
import { ResumeRemovalService } from '../cleanup/resume-removal.service';
import { ResumeCleanupService } from '../cleanup/resume-cleanup.service';

@Module({
    controllers: [ResumeController],
    providers: [ResumeService, StorageService, ResumeRemovalService, ResumeCleanupService],
})
export class ResumeModule { }