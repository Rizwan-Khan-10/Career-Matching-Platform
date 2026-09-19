import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendEligibilityResult(to: string, eligible: boolean) {
    await this.resend.emails.send({
      from: 'noreply@yourdomain.com',
      to,
      subject: eligible ? 'You are eligible for a role!' : 'Application update',
      html: eligible
        ? `<p>Great news — you matched a role's requirements. Check your dashboard for details.</p>`
        : `<p>You weren't a match this time. Check your dashboard for a personalized improvement guide.</p>`,
    });
  }

  async sendFeedbackGuide(to: string, feedback: string) {
    await this.resend.emails.send({
      from: 'noreply@yourdomain.com',
      to,
      subject: 'Your personalized improvement guide',
      html: `<p>${feedback}</p>`,
    });
  }
}