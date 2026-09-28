import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) { }

  async createOrGet(userId: string) {
    return this.prisma.companyProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, name: '' },
    });
  }

  async getByUserId(userId: string) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async update(userId: string, dto: UpdateCompanyDto) {
    return this.prisma.companyProfile.update({ where: { userId }, data: dto });
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const avatarUrl = await this.storage.uploadAvatar(userId, file);
    return this.prisma.companyProfile.update({ where: { userId }, data: { avatarUrl } });
  }
}