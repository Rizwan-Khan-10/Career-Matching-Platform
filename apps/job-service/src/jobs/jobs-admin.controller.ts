import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JobsService } from './jobs.service';
import { SetJobApprovalDto } from './dto/set-job-approval.dto';

/**
 * Admin side of the posting approval. A controller of its own on purpose: JobsController is `@Roles('COMPANY')` for the whole
 * class, which would lock admins out of these routes.
 */
@ApiTags('jobs-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('jobs/admin')
export class JobsAdminController {
    constructor(private service: JobsService) { }

    /** Postings waiting for approval (oldest first). */
    @Get('pending')
    pending() {
        return this.service.listPending();
    }

    /** `{ approved, note? }`: approving releases the posting (scan + matching); always notifies the company. */
    @Patch(':id/approval')
    decide(@Param('id') id: string, @Body() dto: SetJobApprovalDto) {
        return this.service.decideApproval(id, dto);
    }
}
