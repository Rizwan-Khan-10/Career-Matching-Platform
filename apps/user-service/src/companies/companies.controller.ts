import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private service: CompaniesService) {}

  @Roles('COMPANY')
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.service.getByUserId(req.user.userId);
  }

  @Roles('COMPANY')
  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateCompanyDto) {
    return this.service.update(req.user.userId, dto);
  }
}