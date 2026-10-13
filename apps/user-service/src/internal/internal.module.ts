import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalCompaniesController } from './internal-companies.controller';

@Module({ controllers: [InternalController, InternalCompaniesController] })
export class InternalModule { }