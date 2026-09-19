import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApplicantsService } from './applicants.service';
import { UpdateApplicantDto } from './dto/update-applicant.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('applicants')
export class ApplicantsController {
  constructor(private service: ApplicantsService) {}

  @Roles('APPLICANT')
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.service.getByUserId(req.user.userId);
  }

  @Roles('APPLICANT')
  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateApplicantDto) {
    return this.service.update(req.user.userId, dto);
  }
}