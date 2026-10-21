import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UnrecoverableError, Worker } from 'bullmq';
import axios from 'axios';
import { EmailService } from '../email/email.service';

export interface EmailJobLike {
  name: string;
  data: Record<string, any>;
}

const optionalString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const optionalNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Contract §3.3: every caller of an /internal/* endpoint sends x-internal-key (left out when the env var is unset, local dev). */
const internalHeaders = (): Record<string, string> => (process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {});

/** The only five e-mail jobs there are. Anything else (e.g. an old `feedback-guide` job still in Redis) is dropped. */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker;

  constructor(private emailService: EmailService) { }

  onModuleInit() {
    const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
    this.worker = new Worker('email-queue', (job) => this.process(job), { connection });
    this.worker.on('failed', (job, err) => this.logger.error(`email job ${job?.name}#${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  /** Each job type names its own recipient: the applicant for most, the company for 'candidate-ready', a plain address for 'password-reset'. */
  async process(job: EmailJobLike): Promise<void> {
    const d = job.data ?? {};
    switch (job.name) {
      case 'password-reset': {
        const email = optionalString(d.email);
        const resetToken = optionalString(d.resetToken);
        if (!email || !resetToken) throw new UnrecoverableError('password-reset job without email or resetToken');
        await this.emailService.sendPasswordReset(email, resetToken, d.invite === true);
        return;
      }
      case 'email-verification': {
        const email = optionalString(d.email);
        const verifyToken = optionalString(d.verifyToken);
        if (!email || !verifyToken) throw new UnrecoverableError('email-verification job without email or verifyToken');
        await this.emailService.sendEmailVerification(email, verifyToken);
        return;
      }
      case 'eligibility-result': {
        const to = await this.resolveEmail(d.applicantId);
        await this.emailService.sendEligible(to, optionalString(d.roleTitle));
        return;
      }
      case 'candidate-ready': {
        const to = await this.resolveEmail(d.companyId);
        await this.emailService.sendCandidateReady(to, {
          applicantName: optionalString(d.applicantName),
          roleTitle: optionalString(d.roleTitle),
          score: optionalNumber(d.score),
          jobRoleId: optionalString(d.jobRoleId),
        });
        return;
      }
      case 'shortlisted': {
        const to = await this.resolveEmail(d.applicantId);
        await this.emailService.sendShortlisted(to, {
          companyName: optionalString(d.companyName),
          roleTitle: optionalString(d.roleTitle),
          shortlist: d.shortlist,
        });
        return;
      }
      default:
        this.logger.warn(`unsupported email job "${job.name}" dropped`);
    }
  }

  private async resolveEmail(userId: unknown): Promise<string> {
    const id = optionalString(userId);
    if (!id) throw new UnrecoverableError('email job without a recipient id');
    const base = process.env.AUTH_SERVICE_URL;
    if (!base) throw new Error('AUTH_SERVICE_URL is not set');
    try {
      const res = await axios.get(`${base}/internal/users/${encodeURIComponent(id)}/email`, { headers: internalHeaders(), timeout: 10_000 });
      const email = optionalString(res.data?.email);
      if (!email) throw new UnrecoverableError(`auth-service returned no e-mail for user ${id}`);
      return email;
    } catch (err) {
      // a deleted user will never get an address: retrying five times would only fill the log
      if (axios.isAxiosError(err) && err.response?.status === 404) throw new UnrecoverableError(`user ${id} not found in auth-service`);
      throw err;
    }
  }
}