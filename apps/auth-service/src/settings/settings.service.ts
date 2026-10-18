import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  RegistrationMode,
  SystemSettings,
  isValidDomain,
  normalizeDomain,
  normalizeSettings,
} from './settings';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll(): Promise<SystemSettings> {
    const rows = await this.prisma.systemSetting.findMany();
    const raw: Record<string, unknown> = {};
    for (const row of rows) raw[row.key] = row.value;
    return normalizeSettings(raw);
  }

  async getRegistrationMode(): Promise<{ mode: RegistrationMode; allowedDomains: string[] }> {
    const settings = await this.getAll();
    return { mode: settings.registrationMode, allowedDomains: settings.allowedDomains };
  }

  /** Full replace of the four settings, all-or-nothing. */
  async update(dto: UpdateSettingsDto): Promise<SystemSettings> {
    const allowedDomains = this.cleanDomains(dto.allowedDomains);
    if (dto.registrationMode === 'domain' && allowedDomains.length === 0) {
      throw new BadRequestException('Add at least one allowed domain, otherwise nobody could sign up.');
    }

    const values = {
      registrationMode: dto.registrationMode,
      allowedDomains,
      companyApprovalRequired: dto.companyApprovalRequired,
      jobApprovalRequired: dto.jobApprovalRequired,
    };
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
    return this.getAll();
  }

  private cleanDomains(input: string[]): string[] {
    const cleaned = input.map(normalizeDomain).filter((d) => d.length > 0);
    const invalid = cleaned.find((d) => !isValidDomain(d));
    if (invalid) throw new BadRequestException(`"${invalid}" is not a valid domain (example: college.edu)`);
    return [...new Set(cleaned)];
  }
}