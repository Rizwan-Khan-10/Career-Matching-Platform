import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatsService } from './stats.service';
import { PEOPLE_SORTS, PEOPLE_STAGES, type PeopleFilters, type PeopleSort, type PeopleStage } from './stats-people';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

const roleOf = (req: AuthenticatedRequest) => (req.user.role || '').toUpperCase();
const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Query string -> filters. Throws 400 for a missing / unknown stage. */
export function parsePeopleQuery(query: Record<string, unknown>): PeopleFilters {
    const stage = text(query.stage) as PeopleStage | undefined;
    if (!stage || !PEOPLE_STAGES.includes(stage)) throw new BadRequestException(`stage must be one of ${PEOPLE_STAGES.join(', ')}`);
    const sort = text(query.sort) as PeopleSort | undefined;
    return {
        stage,
        jobRoleId: text(query.jobRoleId),
        companyId: text(query.companyId),
        branch: text(query.branch),
        q: text(query.q, 100),
        page: num(query.page),
        limit: num(query.limit),
        sort: sort && PEOPLE_SORTS.includes(sort) ? sort : undefined,
    };
}

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
    constructor(private service: StatsService) { }

    // A company sees ONLY its own numbers.
    @Get('company')
    company(@Req() req: AuthenticatedRequest) {
        if (roleOf(req) !== 'COMPANY') throw new ForbiddenException('Companies only');
        return this.service.forCompany(req.user.userId);
    }

    // Platform-wide numbers for admins.
    @Get('admin')
    admin(@Req() req: AuthenticatedRequest) {
        if (roleOf(req) !== 'ADMIN') throw new ForbiddenException('Admins only');
        return this.service.forAdmin();
    }

    // The people behind a number (admin: every stage).
    @Get('admin/people')
    adminPeople(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
        if (roleOf(req) !== 'ADMIN') throw new ForbiddenException('Admins only');
        return this.service.people(parsePeopleQuery(query), { role: 'ADMIN' });
    }

    @Get('admin/applicant-stages')
    adminApplicantStages(@Req() req: AuthenticatedRequest) {
        if (roleOf(req) !== 'ADMIN') throw new ForbiddenException('Admins only');
        return this.service.applicantStages();
    }

    @Post('admin/people/export-log')
    adminExportLog(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
        if (roleOf(req) !== 'ADMIN') throw new ForbiddenException('Admins only');
        const stage = text(body.stage);
        if (!stage || !PEOPLE_STAGES.includes(stage as PeopleStage)) throw new BadRequestException('Unknown stage');
        return this.service.logPeopleExport(req.user.userId, {
            stage,
            rows: Math.max(0, Math.trunc(num(body.rows) ?? 0)),
            jobRoleId: text(body.jobRoleId),
            companyId: text(body.companyId),
            branch: text(body.branch),
        });
    }

    // A company: only applicants who approved sharing, only its own roles (the server forces the company).
    @Get('company/people')
    companyPeople(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
        if (roleOf(req) !== 'COMPANY') throw new ForbiddenException('Companies only');
        return this.service.people(parsePeopleQuery(query), { role: 'COMPANY', userId: req.user.userId });
    }

    // A company, scanned / matched: aggregate only, no names.
    @Get('company/roles/:jobRoleId/insights')
    companyInsights(@Req() req: AuthenticatedRequest, @Param('jobRoleId') jobRoleId: string) {
        if (roleOf(req) !== 'COMPANY') throw new ForbiddenException('Companies only');
        return this.service.roleInsights(jobRoleId, req.user.userId);
    }
}
