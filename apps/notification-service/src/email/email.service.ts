import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createMailTransport, MailPayload, MailTransport } from './mail-transport';

// Read lazily: ConfigModule loads .env AFTER this file has been imported, so top-level consts would miss .env values.
const cfg = () => ({
  from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  dashboardUrl: process.env.WEB_URL || 'http://localhost:3001',
});

/** Names / titles / LLM text end up inside HTML e-mails: never trust them. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  private send(payload: MailPayload) {
    return this.transport.send(payload);
  }

  async sendEligibilityResult(to: string, eligible: boolean) {
    const { from, dashboardUrl } = cfg();
    await this.send({
      from,
      to,
      subject: eligible ? 'You are eligible for a role!' : 'Application update',
      html: eligible
        ? `<p>Great news — you matched a role's requirements.</p>
           <p>Open your dashboard to see which company it is. Your resume is only sent to them
           <b>after you approve</b>: <a href="${esc(dashboardUrl)}/applicant/matches">review the match</a>.</p>`
        : `<p>You weren't a match this time. Check your dashboard for a personalized improvement guide.</p>`,
    });
  }

  async sendFeedbackGuide(to: string, feedback: string, roleTitle?: string | null) {
    const role = roleTitle ? roleTitle.replace(/\s+/g, ' ').slice(0, 80) : null;
    await this.send({
      from: cfg().from,
      to,
      subject: role ? `How to improve your match for ${role}` : 'Your personalized improvement guide',
      html: `${role ? `<p><b>${esc(role)}</b></p>` : ''}<p>${esc(feedback).replace(/\n/g, '<br/>')}</p>`,
    });
  }

  async sendPasswordReset(to: string, resetToken: string) {
    const { from, dashboardUrl } = cfg();
    const link = `${dashboardUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    await this.send({
      from,
      to,
      subject: 'Reset your password',
      html: `<p>We got a request to reset your password.</p>
             <p><a href="${esc(link)}">Choose a new password</a> (valid for 15 minutes).</p>
             <p>If this wasn't you, ignore this e-mail: your password stays the same.</p>`,
    });
  }

  /**
   * The applicant approved sharing -> the company is only INFORMED. The resume itself is NOT e-mailed:
   * the company logs in, opens the candidate list and views/downloads the PDF there (access is checked server-side).
   */
  async sendCandidateReady(
    to: string,
    d: { applicantName?: string | null; roleTitle?: string | null; score: number; jobRoleId: string },
  ) {
    const { from, dashboardUrl } = cfg();
    const who = d.applicantName || 'A candidate';
    const role = d.roleTitle || 'one of your open roles';
    await this.send({
      from,
      to,
      subject: `New candidate ready for ${role.replace(/\s+/g, ' ').slice(0, 80)}`,
      html: `<p><b>${esc(who)}</b> matched <b>${esc(role)}</b> (${Math.round(d.score * 100)}% match) and
             <b>approved sharing their resume</b> with you.</p>
             <p><a href="${esc(dashboardUrl)}/company/roles/${encodeURIComponent(d.jobRoleId)}/applicants">Log in to view the candidate and download the resume</a>.</p>`,
    });
  }
}