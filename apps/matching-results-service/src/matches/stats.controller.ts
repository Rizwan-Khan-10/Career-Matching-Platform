import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatsService } from './stats.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
    constructor(private service: StatsService) { }

    // A company sees ONLY its own numbers.
    @Get('company')
    company(@Req() req: AuthenticatedRequest) {
        if ((req.user.role || '').toUpperCase() !== 'COMPANY') throw new ForbiddenException('Companies only');
        return this.service.forCompany(req.user.userId);
    }

    // Platform-wide numbers for admins.
    @Get('admin')
    admin(@Req() req: AuthenticatedRequest) {
        if ((req.user.role || '').toUpperCase() !== 'ADMIN') throw new ForbiddenException('Admins only');
        return this.service.forAdmin();
    }
}