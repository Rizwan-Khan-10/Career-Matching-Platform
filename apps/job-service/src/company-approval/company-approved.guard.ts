import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CompanyApprovalService } from './company-approval.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

/**
 * Put it AFTER JwtAuthGuard/RolesGuard (class-level guards run first). As a guard it also runs before the
 * file interceptor, so an unapproved company is refused before a 10 MB upload is read.
 */
@Injectable()
export class CompanyApprovedGuard implements CanActivate {
    constructor(private approval: CompanyApprovalService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
        await this.approval.assertApproved(req.user.userId);
        return true;
    }
}
