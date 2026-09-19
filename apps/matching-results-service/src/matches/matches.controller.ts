import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MatchesService } from './matches.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private service: MatchesService) {}

  @Get('mine')
  mine(@Req() req: AuthenticatedRequest) {
    return this.service.getForApplicant(req.user.userId);
  }

  @Get('role/:jobRoleId')
  forRole(@Param('jobRoleId') jobRoleId: string) {
    return this.service.getForJobRole(jobRoleId);
  }
}