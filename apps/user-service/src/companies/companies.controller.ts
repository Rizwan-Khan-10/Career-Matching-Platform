import { Body, Controller, Get, Patch, Post, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private service: CompaniesService) { }

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

  @Roles('COMPANY')
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  updateAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
    return this.service.updateAvatar(req.user.userId, file);
  }
}