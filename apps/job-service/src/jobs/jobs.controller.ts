import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JobsService } from './jobs.service';
import { CreateJobRoleDto } from './dto/create-job-role.dto';
import { UpdateJobRoleDto } from './dto/update-job-role.dto';
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

    // company stops scanning/matching for this job at any time ...
    @Post(':id/stop')
    stop(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.service.stop(id, req.user.userId);
    }

    // ... and can reopen it later
    @Post(':id/reopen')
    reopen(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.service.reopen(id, req.user.userId);
    }

    @Get(':id/roles')
    roles(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.service.getRoles(id, req.user.userId);
    }

    @Post(':id/roles')
    addRole(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: CreateJobRoleDto) {
        return this.service.createRole(id, req.user.userId, dto);
    }

    @Patch('roles/:roleId')
    updateRole(@Param('roleId') roleId: string, @Req() req: AuthenticatedRequest, @Body() dto: UpdateJobRoleDto) {
        return this.service.updateRole(roleId, req.user.userId, dto);
    }

    @Delete('roles/:roleId')
    removeRole(@Param('roleId') roleId: string, @Req() req: AuthenticatedRequest) {
        return this.service.deleteRole(roleId, req.user.userId);
    }
}