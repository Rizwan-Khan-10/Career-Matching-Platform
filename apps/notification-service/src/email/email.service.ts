import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM || 'noreply@yourdomain.com';
const DASHBOARD_URL = process.env.WEB_URL || 'http://localhost:3001';

/** Names / titles / LLM text end up inside HTML e-mails: never trust them. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  /** Resend does not throw on API errors, it RETURNS them -> turn them into exceptions so BullMQ retries. */
  private async send(payload: Parameters<Resend['emails']['send']>[0]) {
    const { error } = await this.resend.emails.send(payload);
    if (error) throw new Error(`Resend: ${error.message ?? JSON.stringify(error)}`);
  }

  async sendEligibilityResult(to: string, eligible: boolean) {
    await this.send({
      from: FROM,
      to,
      subject: eligible ? 'You are eligible for a role!' : 'Application update',
      html: eligible
        ? `<p>Great news — you matched a role's requirements.</p>
           <p>Open your dashboard to see which company it is. Your resume is only sent to them
           <b>after you approve</b>: <a href="${esc(DASHBOARD_URL)}/applicant/matches">review the match</a>.</p>`
        : `<p>You weren't a match this time. Check your dashboard for a personalized improvement guide.</p>`,
    });
  }

  async sendFeedbackGuide(to: string, feedback: string) {
    await this.send({
      from: FROM,
      to,
      subject: 'Your personalized improvement guide',
      html: `<p>${esc(feedback).replace(/\n/g, '<br/>')}</p>`,
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
    const who = d.applicantName || 'A candidate';
    const role = d.roleTitle || 'one of your open roles';
    await this.send({
      from: FROM,
      to,
      subject: `New candidate ready for ${role}`,
      html: `<p><b>${esc(who)}</b> matched <b>${esc(role)}</b> (${Math.round(d.score * 100)}% match) and
             <b>approved sharing their resume</b> with you.</p>
             <p><a href="${esc(DASHBOARD_URL)}/company/roles/${encodeURIComponent(d.jobRoleId)}/applicants">Log in to view the candidate and download the resume</a>.</p>`,
    });
  }
}