import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EventPublisher } from '../events/event-publisher.service';
import { UpdateApplicantDto } from './dto/update-applicant.dto';

const ACADEMIC_FIELDS = ['cgpa', 'branch', 'passingYear', 'backlogs'] as const;

@Injectable()
export class ApplicantsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private events: EventPublisher,
  ) { }

  async createOrGet(userId: string) {
    return this.prisma.applicantProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, name: '' },
    });
  }

  /** Lazy create: the profile row is made on first read if it is missing (contract §5.2). */
  async getByUserId(userId: string) {
    return this.createOrGet(userId);
  }

  async update(userId: string, dto: UpdateApplicantDto) {
    const profile = await this.createOrGet(userId);
    const { cgpa, branch, passingYear, backlogs, ...general } = dto;
    const academic = { cgpa, branch, passingYear, backlogs };

    // Verified (admin CSV) academic data is locked: those fields are silently ignored.
    const data = profile.academicVerified ? general : { ...general, ...academic };
    const academicChanged =
      !profile.academicVerified &&
      ACADEMIC_FIELDS.some((f) => academic[f] !== undefined && academic[f] !== (profile[f] ?? null));

    const updated = await this.prisma.applicantProfile.update({ where: { userId }, data });
    if (academicChanged) await this.events.publish('profile.updated', { applicantId: userId });
    return updated;
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const previousUrl = (await this.createOrGet(userId)).avatarUrl;
    const avatarUrl = await this.storage.uploadAvatar(userId, file);
    const updated = await this.prisma.applicantProfile.update({ where: { userId }, data: { avatarUrl } });
    // Only after the new photo is saved, so a failure never leaves the user without one.
    await this.storage.deleteAvatarByUrl(previousUrl, userId);
    return updated;
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