import { ForbiddenException } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

describe('StatsService', () => {
    let prisma: any;
    let service: StatsService;

    const role = (over: Record<string, unknown> = {}) => ({
        jobRoleId: 'r1', roleTitle: 'Backend', jobPostingId: 'p1', companyId: 'c1', companyName: 'Acme', stopped: false,
        scanned: 10, matched: 4, applied: 3, shortlisted: 2, rejected: 1, ...over,
    });

    beforeEach(() => {
        prisma = {
            $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
                if (sql.includes('WITH people')) return [{ branch: 'Computer Science', scanned: 8, matched: 3, applied: 2, shortlisted: 1 }, { branch: 'Unknown', scanned: 4, matched: 2, applied: 2, shortlisted: 2 }];
                if (sql.includes('FROM "jobs_service"."JobRole" jr') && sql.includes('AS "roleTitle"')) return [role(), role({ jobRoleId: 'r2', applied: 1, shortlisted: 1, rejected: 0 })];
                if (sql.includes('FROM "matches_service"."RoleScan" rs')) return [{ scanned: 12, matched: 5 }];
                if (sql.includes('FROM "matches_service"."Match" m')) return [{ applied: 4, shortlisted: 3, rejected: 2 }];
                if (sql.includes('AS applicants')) return [{ applicants: 20, resumesScanned: 25, jobs: 3, stoppedJobs: 1 }];
                return [];
            }),
        };
        service = new StatsService(prisma);
    });

    it('company stats include shortlisted and rejected in totals and per role', async () => {
        const res = await service.forCompany('c1');

        expect(res.totals).toEqual({ scanned: 12, matched: 5, applied: 4, shortlisted: 3, rejected: 2 });
        expect(res.roles[0]).toMatchObject({ shortlisted: 2, rejected: 1 });
    });

    it('company stats are limited to the calling company', async () => {
        await service.forCompany('c1');

        const calls = prisma.$queryRawUnsafe.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        for (const c of calls) {
            expect(c[0]).toContain('"companyId" = $1');
            expect(c[1]).toBe('c1');
        }
    });

    it('admin stats add rejected to totals and company roll-ups, and a byBranch list', async () => {
        const res: any = await service.forAdmin();

        expect(res.totals).toEqual({ scanned: 12, matched: 5, applied: 4, shortlisted: 3, rejected: 2 });
        expect(res.companies[0]).toMatchObject({ companyId: 'c1', applied: 4, shortlisted: 3, rejected: 1 });
        expect(res.byBranch).toEqual([
            { branch: 'Computer Science', scanned: 8, matched: 3, applied: 2, shortlisted: 1 },
            { branch: 'Unknown', scanned: 4, matched: 2, applied: 2, shortlisted: 2 },
        ]);
        expect(res.platform).toMatchObject({ applicants: 20 });
    });

    it('byBranch uses the effective branch (verified profile, then resume, then self-entered) and counts people once', async () => {
        await service.byBranch();

        const sql: string = prisma.$queryRawUnsafe.mock.calls[0][0];
        const verified = sql.indexOf('"academicVerified"');
        const resume = sql.indexOf("NULLIF(TRIM(r.branch), '')");
        const self = sql.indexOf("NULLIF(TRIM(ap.branch), '')");
        expect(verified).toBeGreaterThan(-1);
        expect(verified).toBeLessThan(resume);
        expect(resume).toBeLessThan(self);
        expect(sql).toContain("'Unknown'");
        expect(sql).toContain('GROUP BY e.branch');
    });
});

describe('StatsController access', () => {
    const service = { forCompany: jest.fn().mockResolvedValue({}), forAdmin: jest.fn().mockResolvedValue({}) } as any;
    const ctrl = new StatsController(service);
    const req = (role: string) => ({ user: { userId: 'u1', role } }) as any;

    it('lets only a company read /stats/company and only an admin read /stats/admin', () => {
        expect(() => ctrl.company(req('APPLICANT'))).toThrow(ForbiddenException);
        expect(() => ctrl.company(req('ADMIN'))).toThrow(ForbiddenException);
        expect(() => ctrl.admin(req('COMPANY'))).toThrow(ForbiddenException);
        expect(() => ctrl.admin(req('APPLICANT'))).toThrow(ForbiddenException);
        ctrl.company(req('COMPANY'));
        ctrl.admin(req('ADMIN'));
        expect(service.forCompany).toHaveBeenCalledWith('u1');
        expect(service.forAdmin).toHaveBeenCalled();
    });
});
