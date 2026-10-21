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
  constructor(private prisma: PrismaService) { }

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

  /** Full replace of the four original settings; the newer flags are saved only when they are sent. */
  async update(dto: UpdateSettingsDto): Promise<SystemSettings> {
    const allowedDomains = this.cleanDomains(dto.allowedDomains);
    if (dto.registrationMode === 'domain' && allowedDomains.length === 0) {
      throw new BadRequestException('Add at least one allowed domain, otherwise nobody could sign up.');
    }

    const values: Record<string, unknown> = {
      registrationMode: dto.registrationMode,
      allowedDomains,
      companyApprovalRequired: dto.companyApprovalRequired,
      jobApprovalRequired: dto.jobApprovalRequired,
    };
    // an older client that does not send these keeps what is stored
    if (dto.requireTwoFactorForAdmin !== undefined) values.requireTwoFactorForAdmin = dto.requireTwoFactorForAdmin;
    if (dto.emailVerificationRequired !== undefined) values.emailVerificationRequired = dto.emailVerificationRequired;

    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } }),
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