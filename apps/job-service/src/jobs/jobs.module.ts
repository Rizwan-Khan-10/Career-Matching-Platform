import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { StorageService } from '../storage/storage.service';

@Module({ controllers: [JobsController], providers: [JobsService, StorageService] })
export class JobsModule { }