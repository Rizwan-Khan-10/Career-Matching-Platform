import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SETTINGS } from '../settings/settings';

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

/** A wrong or missing seed setting. The message is safe to print: it never contains the password. */
export class SeedConfigError extends Error {}

export interface SeedResult {
  adminCreated: boolean;
  settingsAdded: number;
}

export function readAdminCredentials(env: NodeJS.ProcessEnv): { email: string; password: string } {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new SeedConfigError('ADMIN_EMAIL and ADMIN_PASSWORD must be set to create the first admin');
  }
  if (!isEmail(email)) throw new SeedConfigError('ADMIN_EMAIL is not a valid email address');
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new SeedConfigError(`ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new SeedConfigError(`ADMIN_PASSWORD must be at most ${MAX_PASSWORD_BYTES} bytes`);
  }
  return { email, password };
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) {}

  /** Idempotent: safe to run on every boot or any number of times by hand. */
  async run(env: NodeJS.ProcessEnv = process.env): Promise<SeedResult> {
    const settingsAdded = await this.seedSettings();
    const adminCreated = await this.seedAdmin(env);
    return { adminCreated, settingsAdded };
  }

  /** Adds only the missing default rows; never overwrites a value the admin has changed. */
  private async seedSettings(): Promise<number> {
    const data = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
    const { count } = await this.prisma.systemSetting.createMany({ data, skipDuplicates: true });
    if (count > 0) this.logger.log(`Added ${count} default system setting(s)`);
    return count;
  }

  private async seedAdmin(env: NodeJS.ProcessEnv): Promise<boolean> {
    if (await this.adminExists()) {
      this.logger.log('An admin account already exists, nothing to create');
      return false;
    }

    // Credentials are only needed (and checked) when an admin really has to be created.
    const { email, password } = readAdminCredentials(env);
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      await this.prisma.user.create({ data: { email, passwordHash, role: 'ADMIN' } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      if (await this.adminExists()) return false; // another instance created it a moment ago
      throw new SeedConfigError('ADMIN_EMAIL already belongs to a non-admin account, use another address');
    }

    this.logger.log('Admin account created (change the password after the first login)');
    return true;
  }

  private async adminExists(): Promise<boolean> {
    return (await this.prisma.user.count({ where: { role: 'ADMIN' } })) > 0;
  }
}