import { Body, Controller, Get, Patch, Post, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApplicantsService } from './applicants.service';
import { UpdateApplicantDto } from './dto/update-applicant.dto';
import { ApplicantSummariesDto } from './dto/summaries.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('applicants')
export class ApplicantsController {
  constructor(private service: ApplicantsService) { }

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

  @Roles('APPLICANT')
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  updateAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
    return this.service.updateAvatar(req.user.userId, file);
  }

  // Lets a company see WHO an applicant is, but ONLY applicants who approved sharing with that company
  // (name/headline only, never phone or links).
  @Roles('COMPANY', 'ADMIN')
  @Post('summaries')
  summaries(@Body() dto: ApplicantSummariesDto, @Req() req: AuthenticatedRequest) {
    return this.service.getSummaries(dto.ids, req.user.userId, req.user.role);
  }
}