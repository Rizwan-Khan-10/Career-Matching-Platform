import { Controller, Post, Body, ConflictException, BadRequestException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../events/event-publisher.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { InternalKeyGuard } from './internal-key.guard';

// Called by auth-service at signup and by the admin CSV import. Never exposed through Nginx.
@Controller('internal/profiles')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(
    private prisma: PrismaService,
    private events: EventPublisher,
  ) { }

  @Post()
  async createProfile(@Body() dto: CreateProfileDto) {
    if (dto.role === 'APPLICANT') return this.createApplicant(dto);
    if (dto.role === 'COMPANY') return this.createCompany(dto);
    throw new BadRequestException('Invalid role');
  }

  private async createApplicant(dto: CreateProfileDto) {
    const existing = await this.prisma.applicantProfile.findUnique({ where: { userId: dto.userId } });
    if (existing) throw new ConflictException('Profile already exists');

    const academic = dto.academic ?? {};
    const profile = await this.prisma.applicantProfile.create({
      data: {
        userId: dto.userId,
        name: dto.name ?? null,
        cgpa: academic.cgpa,
        branch: academic.branch,
        passingYear: academic.passingYear,
        backlogs: academic.backlogs,
        academicVerified: dto.academicVerified === true,
      },
    });

    // Imported academic data counts as an academic change too (matching re-checks the applicant).
    const hasAcademic = Object.values(academic).some((v) => v !== undefined && v !== null);
    if (hasAcademic) await this.events.publish('profile.updated', { applicantId: dto.userId });
    return profile;
  }

  private async createCompany(dto: CreateProfileDto) {
    const existing = await this.prisma.companyProfile.findUnique({ where: { userId: dto.userId } });
    if (existing) throw new ConflictException('Profile already exists');

    return this.prisma.companyProfile.create({
      data: { userId: dto.userId, name: dto.name ?? null, status: dto.companyStatus ?? 'approved' },
    });
  }
}