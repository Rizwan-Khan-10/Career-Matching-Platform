import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResumeService } from './resume.service';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { UploadResumeDto } from './dto/upload-resume.dto';
import { getTargetRoles } from '../taxonomy/taxonomy';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { uploadOptions } from '../common/upload';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('APPLICANT')
@Controller('resumes')
export class ResumeController {
    constructor(private service: ResumeService) { }

    // Taxonomy for the upload dropdowns and the company role form: any logged-in role
    @Roles('APPLICANT', 'COMPANY', 'ADMIN')
    @Get('target-roles')
    targetRoles() {
        return getTargetRoles();
    }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file', uploadOptions))
    upload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadResumeDto) {
        return this.service.upload(req.user.userId, file, dto);
    }

    @Get('mine')
    mine(@Req() req: AuthenticatedRequest) {
        return this.service.getByApplicant(req.user.userId);
    }

    // Applicant confirms the parsed data: this is what starts matching (resume.confirmed)
    @Post(':id/confirm')
    @HttpCode(HttpStatus.OK)
    confirm(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.service.confirm(id, req.user.userId);
    }

    // Company/admin: signed link to the PDF of a resume the applicant approved sharing with them
    @Roles('COMPANY', 'ADMIN')
    @Get(':id/pdf')
    sharedPdf(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.service.getSharedPdfLink(id, req.user.userId, req.user.role);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: UpdateResumeDto) {
        return this.service.updateOwn(id, req.user.userId, dto);
    }

    // Applicant deletes a resume: 409 while an approved match uses it, otherwise Cloudinary + embedding + DB row are removed
    @Delete(':id')
    remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.service.deleteOwn(id, req.user.userId);
    }
}