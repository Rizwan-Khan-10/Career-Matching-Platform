import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ShortlistDefaultsDto } from './dto/shortlist-defaults.dto';
import { Prisma } from '../generated/prisma/client';

const DEFAULT_KEYS = ['roundName', 'mode', 'link', 'address', 'bring', 'note'] as const;

/** Only known keys, trimmed, empty ones dropped. {} = nothing worth saving. */
export function cleanShortlistDefaults(input: unknown): Record<string, string> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of DEFAULT_KEYS) {
    const v = src[key];
    if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim();
  }
  return out;
}

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

  /** The company's saved shortlist template ({} when none). Private: only the company itself reads it. */
  async getShortlistDefaults(userId: string): Promise<Record<string, string>> {
    const profile = await this.createOrGet(userId);
    return cleanShortlistDefaults(profile.shortlistDefaults);
  }

  /** Replaces the template. Saving nothing (all fields empty) clears it. */
  async setShortlistDefaults(userId: string, dto: ShortlistDefaultsDto): Promise<Record<string, string>> {
    await this.createOrGet(userId);
    const clean = cleanShortlistDefaults(dto);
    await this.prisma.companyProfile.update({
      where: { userId },
      data: { shortlistDefaults: Object.keys(clean).length > 0 ? clean : Prisma.DbNull },
    });
    return clean;
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const previousUrl = (await this.createOrGet(userId)).avatarUrl;
    const avatarUrl = await this.storage.uploadAvatar(userId, file);
    const updated = await this.prisma.companyProfile.update({ where: { userId }, data: { avatarUrl } });
    await this.storage.deleteAvatarByUrl(previousUrl, userId);
    return updated;
  }
}