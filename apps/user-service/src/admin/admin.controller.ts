import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AuditService } from '../audit/audit.service';
import { ListAuditDto } from '../audit/dto/list-audit.dto';
import { AdminService } from './admin.service';
import { StreamsHealthService } from './streams-health.service';
import { SetCompanyStatusDto } from './dto/set-company-status.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private service: AdminService,
    private streams: StreamsHealthService,
    private audit: AuditService,
  ) { }

  @Get('applicants')
  applicants() { return this.service.listApplicants(); }

  @Get('companies')
  companies() { return this.service.listCompanies(); }

  @Patch('companies/:userId/status')
  setCompanyStatus(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: SetCompanyStatusDto,
  ) {
    return this.service.setCompanyStatus(req.user.userId, userId, dto.status);
  }

  @Get('health')
  health() { return this.streams.getStreams(); }

  @Get('audit')
  auditLog(@Query() query: ListAuditDto) { return this.audit.list(query.limit ?? 50); }
}