import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { ProfilePayload, UserServiceClient } from '../clients/user-service.client';
import { ImportUserRowDto } from './dto/import-users.dto';

export const INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // invite link valid for 7 days

export interface ImportResult {
  created: { email: string; id: string }[];
  skipped: { email: string; reason: string }[];
}

type ParsedRow = { row: ImportUserRowDto } | { email: string; reason: string };

export function parseImportRow(raw: unknown): ParsedRow {
  const rawEmail = (raw as { email?: unknown })?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const row = plainToInstance(ImportUserRowDto, raw);
  const errors = validateSync(row, { whitelist: true });
  if (errors.length > 0) {
    const reason = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
    return { email, reason };
  }
  return { row };
}

@Injectable()
export class UserImportService {
  private readonly logger = new Logger(UserImportService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mail: MailQueueService,
    private userService: UserServiceClient,
  ) {}

  async importUsers(actorId: string, rawRows: unknown[]): Promise<ImportResult> {
    const result: ImportResult = { created: [], skipped: [] };
    const parsed = rawRows.map(parseImportRow);
    const existing = await this.findExistingEmails(parsed);
    const seen = new Set<string>();

    for (const item of parsed) {
      if ('reason' in item) {
        result.skipped.push({ email: item.email, reason: item.reason });
        continue;
      }
      const { row } = item;
      if (seen.has(row.email)) {
        result.skipped.push({ email: row.email, reason: 'Duplicate email in this file' });
        continue;
      }
      seen.add(row.email);
      if (existing.has(row.email)) {
        result.skipped.push({ email: row.email, reason: 'Email already registered' });
        continue;
      }

      const outcome = await this.importOne(row);
      if ('id' in outcome) result.created.push({ email: row.email, id: outcome.id });
      else result.skipped.push({ email: row.email, reason: outcome.reason });
    }

    await this.userService.audit({
      actorId,
      action: 'users.imported',
      target: 'users:import',
      meta: { created: result.created.length, skipped: result.skipped.length },
    });
    return result;
  }

  private async findExistingEmails(parsed: ParsedRow[]): Promise<Set<string>> {
    const emails = parsed.flatMap((p) => ('row' in p ? [p.row.email] : []));
    if (emails.length === 0) return new Set();
    const found = await this.prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    return new Set(found.map((u) => u.email));
  }

  private async importOne(row: ImportUserRowDto): Promise<{ id: string } | { reason: string }> {
    // Throw-away password nobody knows: 256 random bits, so a cheap bcrypt cost is fine
    // (keeps a 500-row import fast). The user sets a real one through the invite link.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 4);

    let userId: string;
    try {
      const user = await this.prisma.user.create({
        data: { email: row.email, passwordHash, role: row.role },
        select: { id: true },
      });
      userId = user.id;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return { reason: 'Email already registered' };
      this.logger.error(`could not create an imported account: ${(err as Error).message}`);
      return { reason: 'Could not create the account' };
    }

    try {
      await this.userService.createProfile(this.profilePayload(userId, row));
    } catch (err) {
      // No half-made accounts: undo the user so the admin can simply retry this row.
      this.logger.warn(`profile creation failed for ${userId}: ${(err as Error).message}`);
      await this.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      return { reason: 'Could not create the profile, please retry this row' };
    }

    await this.sendInvite(userId, row.email);
    return { id: userId };
  }

  private profilePayload(userId: string, row: ImportUserRowDto): ProfilePayload {
    const payload: ProfilePayload = {
      userId,
      role: row.role,
      email: row.email,
      name: row.name,
      companyStatus: 'approved', // imported companies are always approved (contract §5.1)
    };
    if (row.role === 'APPLICANT') {
      const academic = {
        cgpa: row.cgpa,
        branch: row.branch,
        passingYear: row.passingYear,
        backlogs: row.backlogs,
      };
      // Only lock the academic fields when the admin actually supplied values.
      if (Object.values(academic).some((v) => v !== undefined)) {
        payload.academic = academic;
        payload.academicVerified = true;
      }
    }
    return payload;
  }

  private async sendInvite(userId: string, email: string): Promise<void> {
    try {
      const token = randomBytes(32).toString('hex');
      await this.redis.client.set(`reset:${token}`, userId, 'EX', INVITE_TOKEN_TTL_SECONDS);
      await this.mail.enqueueInvite(email, token);
    } catch (err) {
      // The account exists; the user can still use "Forgot password". Never log the token.
      this.logger.warn(`invite e-mail was not queued for ${userId}: ${(err as Error).message}`);
    }
  }
}