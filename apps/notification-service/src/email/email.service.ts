import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createMailTransport, MailTransport } from './mail-transport';
import { candidateReadyEmail, eligibleEmail, passwordResetEmail, RenderedEmail, shortlistedEmail } from './templates';

// Read lazily: ConfigModule loads .env AFTER this file has been imported, so top-level consts would miss .env values.
const cfg = () => ({
  from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  webUrl: process.env.WEB_URL || 'http://localhost:3000',
});

/** The four e-mails this platform sends (contract §7): password reset / invite, eligible, candidate ready, shortlisted. */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  // EMAIL_PROVIDER=gmail (local dev, Gmail app password) | resend (production). A misconfiguration fails at startup, not on the first mail.
  private readonly transport: MailTransport = createMailTransport();

  async onModuleInit() {
    this.logger.log(`e-mail provider: ${this.transport.name}`);
    try {
      await this.transport.verify?.();
      if (this.transport.verify) this.logger.log('SMTP login OK');
    } catch (err) {
      // do not crash the worker: jobs would just retry. But say loudly WHY mail will not go out.
      this.logger.error(`e-mail provider check failed: ${(err as Error).message} (wrong GMAIL_USER / app password, or 2-Step Verification is off?)`);
    }
  }

  private send(to: string, mail: RenderedEmail) {
    return this.transport.send({ from: cfg().from, to, ...mail });
  }

  /** `invite: true` = an admin imported this user: the mail says "set your password", the link lives 7 days. */
  sendPasswordReset(to: string, resetToken: string, invite = false) {
    return this.send(to, passwordResetEmail({ webUrl: cfg().webUrl, resetToken, invite }));
  }

  sendEligible(to: string, roleTitle?: string | null) {
    return this.send(to, eligibleEmail({ webUrl: cfg().webUrl, roleTitle }));
  }

  sendCandidateReady(to: string, d: { applicantName?: string | null; roleTitle?: string | null; score?: number | null; jobRoleId?: string | null }) {
    return this.send(to, candidateReadyEmail({ webUrl: cfg().webUrl, ...d }));
  }

  sendShortlisted(to: string, d: { companyName?: string | null; roleTitle?: string | null; shortlist?: unknown }) {
    return this.send(to, shortlistedEmail({ webUrl: cfg().webUrl, ...d }));
  }
}