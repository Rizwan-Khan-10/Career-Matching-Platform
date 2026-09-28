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
}