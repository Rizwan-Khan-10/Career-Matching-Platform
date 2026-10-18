import { Injectable } from '@nestjs/common';
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

  /** Lazy create on first read (contract §5.2). The response includes `status`. */
  async getByUserId(userId: string) {
    return this.createOrGet(userId);
  }

  async update(userId: string, dto: UpdateCompanyDto) {
    await this.createOrGet(userId);
    return this.prisma.companyProfile.update({ where: { userId }, data: dto });
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const previousUrl = (await this.createOrGet(userId)).avatarUrl;
    const avatarUrl = await this.storage.uploadAvatar(userId, file);
    const updated = await this.prisma.companyProfile.update({ where: { userId }, data: { avatarUrl } });
    await this.storage.deleteAvatarByUrl(previousUrl, userId);
    return updated;
  }
}