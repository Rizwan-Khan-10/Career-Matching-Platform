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

    /** Newest first. */
    list(limit = 50) {
        return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    }
}