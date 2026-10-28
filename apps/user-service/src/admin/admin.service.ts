import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../events/event-publisher.service';
import { CompanyStatus } from './dto/set-company-status.dto';

interface AccountRow {
  id: string;
  email: string;
  isActive: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private events: EventPublisher,
  ) { }

  async listApplicants() {
    const profiles = await this.prisma.applicantProfile.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return this.withAccountInfo(profiles);
  }

  async listCompanies() {
    const profiles = await this.prisma.companyProfile.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    // the saved shortlist template belongs to the company only
    return this.withAccountInfo(profiles.map(({ shortlistDefaults: _private, ...p }) => p));
  }

  async setCompanyStatus(actorId: string, userId: string, status: CompanyStatus) {
    const company = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.status === status) return company; // nothing changed: no event, no audit entry

    // The status change and its audit entry are saved together or not at all.
    const [updated] = await this.prisma.$transaction([
      this.prisma.companyProfile.update({ where: { userId }, data: { status } }),
      this.prisma.auditLog.create({
        data: { actorId, action: 'company.status.changed', target: userId, meta: { from: company.status, to: status } },
      }),
    ]);

    await this.events.publish('company.status.changed', { companyId: userId, status });
    return updated;
  }

  /**
   * email / isActive live in the auth_service schema of the same database (read-only SELECT, no writes).
   * A profile whose account no longer exists gets nulls.
   */
  private async withAccountInfo<T extends { userId: string }>(profiles: T[]) {
    if (profiles.length === 0) return [];

    const ids = profiles.map((p) => p.userId);
    const accounts = await this.prisma.$queryRaw<AccountRow[]>`
      SELECT "id", "email", "isActive" FROM "auth_service"."User" WHERE "id" = ANY(${ids}::text[])`;
    const byId = new Map(accounts.map((a) => [a.id, a]));

    return profiles.map((p) => ({
      ...p,
      email: byId.get(p.userId)?.email ?? null,
      isActive: byId.get(p.userId)?.isActive ?? null,
    }));
  }
}