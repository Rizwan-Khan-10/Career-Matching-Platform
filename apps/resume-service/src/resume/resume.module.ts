import { Module } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { StorageService } from '../storage/storage.service';

@Module({ controllers: [ResumeController], providers: [ResumeService, StorageService] })
export class ResumeModule {}