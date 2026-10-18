import { Module } from '@nestjs/common';
import { CompanyApprovalService } from './company-approval.service';
import { CompanyApprovedGuard } from './company-approved.guard';

@Module({ providers: [CompanyApprovalService, CompanyApprovedGuard], exports: [CompanyApprovalService, CompanyApprovedGuard] })
export class CompanyApprovalModule { }
