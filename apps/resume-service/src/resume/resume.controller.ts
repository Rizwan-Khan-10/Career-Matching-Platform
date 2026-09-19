import { Controller, Post, Get, UseGuards, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResumeService } from './resume.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('APPLICANT')
@Controller('resumes')
export class ResumeController {
    constructor(private service: ResumeService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    upload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
        return this.service.upload(req.user.userId, file);
    }

    @Get('mine')
    mine(@Req() req: AuthenticatedRequest) {
        return this.service.getByApplicant(req.user.userId);
    }
}