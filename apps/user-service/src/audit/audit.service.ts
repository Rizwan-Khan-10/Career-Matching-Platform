import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
    actorId: string;
    action: string;
    target: string;
    meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
    constructor(private prisma: PrismaService) { }

    record(entry: AuditEntry) {
        return this.prisma.auditLog.create({
            data: {
                actorId: entry.actorId,
                action: entry.action,
                target: entry.target,
                meta: entry.meta as Prisma.InputJsonObject | undefined,
            },
        });
    }

    /**
     * Newest first. Each entry also carries `actorName` and `targetLabel` (e.g. "Company: Acme Ltd") so the admin
     * does not have to read raw user ids. Both are null when the id is not a known profile.
     */
    async list(limit = 50, personId?: string) {
        const rows = await this.prisma.auditLog.findMany({
            ...(personId ? { where: { OR: [{ actorId: personId }, { target: personId }] } } : {}),
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.target]).filter((v) => ID_LIKE.test(v)))];
        const names = new Map<string, string>();
        const kinds = new Map<string, 'Applicant' | 'Company'>();
        if (ids.length > 0) {
            const [applicants, companies] = await Promise.all([
                this.prisma.applicantProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, name: true } }),
                this.prisma.companyProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, name: true } }),
            ]);
            for (const a of applicants) { kinds.set(a.userId, 'Applicant'); if (a.name) names.set(a.userId, a.name); }
            for (const c of companies) { kinds.set(c.userId, 'Company'); if (c.name) names.set(c.userId, c.name); }
        }

        return rows.map((r) => {
            const targetKind = kinds.get(r.target);
            const targetName = names.get(r.target);
            return {
                ...r,
                actorName: names.get(r.actorId) ?? null,
                targetLabel: targetKind ? (targetName ? `${targetKind}: ${targetName}` : `${targetKind} (no name yet)`) : null,
            };
        });
    }
}

const ID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
