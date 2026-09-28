import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { StorageService } from '../storage/storage.service';

@Module({ controllers: [CompaniesController], providers: [CompaniesService, StorageService] })
export class CompaniesModule { }