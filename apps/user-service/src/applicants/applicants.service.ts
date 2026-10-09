import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateApplicantDto } from './dto/update-applicant.dto';

@Injectable()
export class ApplicantsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) { }

  async createOrGet(userId: string) {
    return this.prisma.applicantProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, name: '' },
    });
  }

  async getByUserId(userId: string) {
    const profile = await this.prisma.applicantProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async update(userId: string, dto: UpdateApplicantDto) {
    return this.prisma.applicantProfile.update({ where: { userId }, data: dto });
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const avatarUrl = await this.storage.uploadAvatar(userId, file);
    return this.prisma.applicantProfile.update({ where: { userId }, data: { avatarUrl } });
  }

  async getSummaries(userIds: string[], companyUserId: string, role: string) {
    if (!userIds.length) return [];

    let allowed = userIds;
    if ((role || '').toUpperCase() !== 'ADMIN') {
      // consent: only applicants who approved a match on one of THIS company's roles (matches/jobs live in
      // other schemas of the same database). Everyone else is simply not returned.
      const rows = await this.prisma.$queryRawUnsafe<{ applicantId: string }[]>(
        `SELECT DISTINCT m."applicantId" AS "applicantId"
           FROM "matches_service"."Match" m
           JOIN "jobs_service"."JobRole" jr ON jr.id = m."jobRoleId"
           JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
          WHERE m."applicantStatus" = 'approved' AND m.eligible = true
            AND jp."companyId" = $1 AND m."applicantId" = ANY($2::text[])`,
        companyUserId,
        userIds,
      );
      allowed = rows.map((r) => r.applicantId);
    }
    if (!allowed.length) return [];

    return this.prisma.applicantProfile.findMany({
      where: { userId: { in: allowed } },
      select: { userId: true, name: true, headline: true, location: true, education: true, avatarUrl: true },
    });
  }
}