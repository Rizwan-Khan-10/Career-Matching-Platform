import { Controller, Post, Get, Param, UseGuards, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JobsService } from './jobs.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY')
@Controller('jobs')
export class JobsController {
    constructor(private service: JobsService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    upload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
        return this.service.upload(req.user.userId, file);
    }

    @Get('mine')
    mine(@Req() req: AuthenticatedRequest) {
        return this.service.getByCompany(req.user.userId);
    }

    @Get(':id/roles')
    roles(@Param('id') id: string) {
        return this.service.getRoles(id);
    }
}