import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

export interface MailPayload {
  from?: string;
  to: string;
  subject: string;
  html: string;
}

export interface MailTransport {
  readonly name: string;
  /** Throws on ANY delivery failure, so BullMQ retries the job. */
  send(payload: MailPayload): Promise<void>;
  /** Optional startup check (SMTP login) - lets us log a clear message instead of failing on the first real e-mail. */
  verify?(): Promise<void>;
}

type Env = Record<string, string | undefined>;

class ResendTransport implements MailTransport {
  readonly name = 'resend';
  private readonly client: Resend;
  private readonly from: string;

  constructor(env: Env) {
    if (!env.RESEND_API_KEY) throw new Error('EMAIL_PROVIDER=resend needs RESEND_API_KEY');
    this.client = new Resend(env.RESEND_API_KEY);
    this.from = env.EMAIL_FROM || 'onboarding@resend.dev'; // Resend's test sender works until your own domain is verified
  }

  async send(p: MailPayload): Promise<void> {
    // Resend does not throw on API errors, it RETURNS them -> turn them into exceptions
    const { error } = await this.client.emails.send({ from: p.from || this.from, to: p.to, subject: p.subject, html: p.html });
    if (error) throw new Error(`Resend: ${error.message ?? JSON.stringify(error)}`);
  }
}

/** Gmail SMTP with an App Password. Works from localhost (no domain, no DNS). Dev only: ~500 mails/day, always sent "from" the Gmail account. */
class GmailTransport implements MailTransport {
  readonly name = 'gmail';
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(env: Env) {
    const user = env.GMAIL_USER?.trim();
    // Google shows the app password as "abcd efgh ijkl mnop" - the spaces are only for display
    const pass = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
    if (!user || !pass) throw new Error('EMAIL_PROVIDER=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD');
    this.from = `"${(env.GMAIL_FROM_NAME || 'Career Match').replace(/["\r\n]/g, '')}" <${user}>`;
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(p: MailPayload): Promise<void> {
    // Gmail ignores any other From address, so always use our own
    await this.transporter.sendMail({ from: this.from, to: p.to, subject: p.subject, html: p.html });
  }
}

/**
 * Dev safety net: test accounts usually have fake addresses. With EMAIL_DEV_REDIRECT_TO set, EVERY mail goes to that one
 * inbox instead (subject is prefixed with the original recipient) - nothing bounces, nobody real gets test mails.
 */
function withDevRedirect(inner: MailTransport, redirectTo: string): MailTransport {
  return {
    name: `${inner.name} -> all mail redirected to ${redirectTo}`,
    verify: inner.verify ? () => inner.verify!() : undefined,
    send: (p) => inner.send({ ...p, to: redirectTo, subject: `[to: ${p.to}] ${p.subject}` }),
  };
}

export function createMailTransport(env: Env = process.env): MailTransport {
  const provider = (env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
  let transport: MailTransport;
  if (provider === 'gmail') transport = new GmailTransport(env);
  else if (provider === 'resend') transport = new ResendTransport(env);
  else throw new Error(`EMAIL_PROVIDER must be "gmail" or "resend", got "${provider}"`);

  const redirect = env.EMAIL_DEV_REDIRECT_TO?.trim();
  return redirect ? withDevRedirect(transport, redirect) : transport;
}