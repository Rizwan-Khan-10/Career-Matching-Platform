import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MatchesService } from './matches.service';
import { SetDecisionDto } from './dto/set-decision.dto';
import { SetApprovalDto } from './dto/set-approval.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

function assertCompanySide(req: AuthenticatedRequest) {
  const role = (req.user.role || '').toUpperCase();
  if (role !== 'COMPANY' && role !== 'ADMIN') {
    throw new ForbiddenException('Only companies can do this');
  }
}

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private service: MatchesService) {}

  @Get('mine')
  mine(@Req() req: AuthenticatedRequest) {
    return this.service.getForApplicant(req.user.userId);
  }

  // Applicant approves (true) or declines (false) sharing their resume with the company behind this match.
  @Patch(':id/approval')
  approve(@Param('id') id: string, @Body() dto: SetApprovalDto, @Req() req: AuthenticatedRequest) {
    return this.service.setApproval(id, req.user.userId, dto.approved);
  }

  // Candidates who APPROVED, for a role of the calling company (or an admin). Unapproved matches are never exposed.
  @Get('role/:jobRoleId')
  async forRole(@Param('jobRoleId') jobRoleId: string, @Req() req: AuthenticatedRequest) {
    assertCompanySide(req);
    await this.service.assertCompanyOwnsRole(jobRoleId, req.user.userId, req.user.role);
    return this.service.getForJobRole(jobRoleId);
  }

  @Patch(':id/decision')
  decide(@Param('id') id: string, @Body() dto: SetDecisionDto, @Req() req: AuthenticatedRequest) {
    assertCompanySide(req);
    return this.service.setDecision(id, req.user.userId, req.user.role, dto.decision);
  }
}