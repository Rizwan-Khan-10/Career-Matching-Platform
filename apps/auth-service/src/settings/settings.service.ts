import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationMode, SystemSettings, normalizeSettings } from './settings';

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
}