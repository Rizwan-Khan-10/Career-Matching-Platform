import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateApplicantDto } from './dto/update-applicant.dto';

@Injectable()
export class ApplicantsService {
  constructor(private prisma: PrismaService) {}

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
}