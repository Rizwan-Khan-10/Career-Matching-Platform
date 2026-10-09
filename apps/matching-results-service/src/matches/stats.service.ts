import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RoleStats {
    jobRoleId: string;
    roleTitle: string;
    jobPostingId: string;
    companyId?: string;
    companyName?: string | null;
    stopped: boolean;
    scanned: number;   // applicants the matching-agent evaluated for this role
    matched: number;   // ... of which eligible
    applied: number;   // ... of which approved sharing their resume with the company
    shortlisted: number;
}

export interface Totals {
    scanned: number;
    matched: number;
    applied: number;
    shortlisted: number;
}

/**
 * Funnel numbers for the dashboards. Everything is computed in SQL (counts cast to int: Prisma returns bigint
 * for COUNT, which JSON cannot serialise). The jobs/users schemas live in the same database, like everywhere else.
 */
@Injectable()
export class StatsService {
    constructor(private prisma: PrismaService) { }

    private roleRowsSql(where: string) {
        return `
            SELECT jr.id AS "jobRoleId", jr.title AS "roleTitle", jp.id AS "jobPostingId", jp."companyId" AS "companyId",
                   cp.name AS "companyName", (jp."stoppedAt" IS NOT NULL) AS stopped,
                   COALESCE(s.scanned, 0)::int AS scanned, COALESCE(s.matched, 0)::int AS matched,
                   COALESCE(m.applied, 0)::int AS applied, COALESCE(m.shortlisted, 0)::int AS shortlisted
            FROM "jobs_service"."JobRole" jr
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            LEFT JOIN "users_service"."CompanyProfile" cp ON cp."userId" = jp."companyId"
            LEFT JOIN (
                SELECT "jobRoleId", COUNT(*) AS scanned, COUNT(*) FILTER (WHERE eligible) AS matched
                FROM "matches_service"."RoleScan" GROUP BY "jobRoleId"
            ) s ON s."jobRoleId" = jr.id
            LEFT JOIN (
                SELECT "jobRoleId",
                       COUNT(*) FILTER (WHERE "applicantStatus" = 'approved' AND eligible) AS applied,
                       COUNT(*) FILTER (WHERE decision = 'shortlisted') AS shortlisted
                FROM "matches_service"."Match" GROUP BY "jobRoleId"
            ) m ON m."jobRoleId" = jr.id
            ${where}
            ORDER BY jp."createdAt" DESC, jr.title ASC`;
    }

    /** Distinct applicants (one person counts once even if scanned for several roles). */
    private async totals(companyId: string | null): Promise<Totals> {
        const filter = companyId ? `WHERE jp."companyId" = $1` : '';
        const args = companyId ? [companyId] : [];
        const scan = await this.prisma.$queryRawUnsafe<{ scanned: number; matched: number }[]>(
            `SELECT COUNT(DISTINCT rs."applicantId")::int AS scanned,
                    (COUNT(DISTINCT rs."applicantId") FILTER (WHERE rs.eligible))::int AS matched
             FROM "matches_service"."RoleScan" rs
             JOIN "jobs_service"."JobRole" jr ON jr.id = rs."jobRoleId"
             JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId" ${filter}`,
            ...args,
        );
        const dec = await this.prisma.$queryRawUnsafe<{ applied: number; shortlisted: number }[]>(
            `SELECT (COUNT(DISTINCT m."applicantId") FILTER (WHERE m."applicantStatus" = 'approved' AND m.eligible))::int AS applied,
                    (COUNT(DISTINCT m."applicantId") FILTER (WHERE m.decision = 'shortlisted'))::int AS shortlisted
             FROM "matches_service"."Match" m
             JOIN "jobs_service"."JobRole" jr ON jr.id = m."jobRoleId"
             JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId" ${filter}`,
            ...args,
        );
        return {
            scanned: scan[0]?.scanned ?? 0,
            matched: scan[0]?.matched ?? 0,
            applied: dec[0]?.applied ?? 0,
            shortlisted: dec[0]?.shortlisted ?? 0,
        };
    }

    async forCompany(companyId: string) {
        const [totals, roles] = await Promise.all([
            this.totals(companyId),
            this.prisma.$queryRawUnsafe<RoleStats[]>(this.roleRowsSql(`WHERE jp."companyId" = $1`), companyId),
        ]);
        return { totals, roles };
    }

    async forAdmin() {
        const [totals, roles, platform] = await Promise.all([
            this.totals(null),
            this.prisma.$queryRawUnsafe<RoleStats[]>(this.roleRowsSql('')),
            this.prisma.$queryRawUnsafe<{ applicants: number; resumesScanned: number; jobs: number; stoppedJobs: number }[]>(`
                SELECT (SELECT COUNT(*) FROM "users_service"."ApplicantProfile")::int AS applicants,
                       (SELECT COUNT(*) FROM "resumes_service"."Resume" WHERE status = 'parsed')::int AS "resumesScanned",
                       (SELECT COUNT(*) FROM "jobs_service"."JobPosting")::int AS jobs,
                       (SELECT COUNT(*) FROM "jobs_service"."JobPosting" WHERE "stoppedAt" IS NOT NULL)::int AS "stoppedJobs"`),
        ]);

        // per-company roll-up (a person scanned for two of a company's roles counts twice here: it is a sum over roles)
        const byCompany = new Map<string, any>();
        for (const r of roles) {
            const key = r.companyId ?? 'unknown';
            const c = byCompany.get(key) ?? { companyId: key, companyName: r.companyName || 'Unnamed company', jobs: new Set<string>(), stoppedJobs: new Set<string>(), scanned: 0, matched: 0, applied: 0, shortlisted: 0 };
            c.jobs.add(r.jobPostingId);
            if (r.stopped) c.stoppedJobs.add(r.jobPostingId);
            c.scanned += r.scanned; c.matched += r.matched; c.applied += r.applied; c.shortlisted += r.shortlisted;
            byCompany.set(key, c);
        }
        const companies = [...byCompany.values()]
            .map((c) => ({ ...c, jobs: c.jobs.size, stoppedJobs: c.stoppedJobs.size }))
            .sort((a, b) => b.applied - a.applied || b.matched - a.matched);

        return { platform: platform[0], totals, companies, roles: roles.slice(0, 300) };
    }
}