import { Logger } from '@nestjs/common';
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
    if (error) {
      const status = (error as { statusCode?: number | null }).statusCode ?? undefined;
      const name = (error as { name?: string }).name;
      throw Object.assign(new Error(`Resend: ${error.message ?? JSON.stringify(error)}`), {
        // rate limit / Resend-side outage: the address itself is fine, so retrying later makes sense
        transient: status === 429 || (status !== undefined && status >= 500) || name === 'rate_limit_exceeded' || name === 'application_error' || name === 'internal_server_error',
      });
    }
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

const logger = new Logger('MailTransport');

const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * True when the failure says nothing about the recipient address (network down, timeout, provider 4xx/5xx-outage,
 * rate limit). Those must NOT fall back: the job should fail so BullMQ retries the real recipient later.
 */
export function isTransientMailError(err: unknown): boolean {
  const e = err as { transient?: boolean; code?: string; responseCode?: number };
  if (e?.transient) return true;
  if (typeof e?.responseCode === 'number' && e.responseCode >= 400 && e.responseCode < 500) return true; // SMTP 4xx = "try again later"
  return ['ETIMEDOUT', 'ETIMEOUT', 'ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET', 'EDNS', 'EAI_AGAIN'].includes(e?.code ?? '');
}

/**
 * Dev safety net (EMAIL_DEV_REDIRECT_TO): the mail ALWAYS goes to the real recipient first. Only when delivery to that
 * address is refused (invalid / rejected / unverified-recipient errors) is it sent to the fallback inbox instead, with the
 * original recipient and the reason in the subject and at the top of the mail - so nothing gets lost and no test
 * account has to be real. Transient failures are re-thrown (BullMQ retries); if the fallback fails too, that throws as well.
 *
 * Note for Gmail SMTP: an address that does not exist is often accepted by Gmail and only bounces afterwards by e-mail
 * to the sender, which cannot be detected here. Only errors reported at send time trigger the fallback.
 */
export function withFallback(inner: MailTransport, fallbackTo: string): MailTransport {
  return {
    name: `${inner.name} (falls back to ${fallbackTo} if the real recipient fails)`,
    verify: inner.verify ? () => inner.verify!() : undefined,
    async send(p) {
      // a mail that is already addressed to the fallback inbox has nothing left to fall back to
      if (p.to.trim().toLowerCase() === fallbackTo.toLowerCase()) return inner.send(p);
      try {
        await inner.send(p);
      } catch (err) {
        if (isTransientMailError(err)) throw err;
        const reason = (err as Error)?.message ?? String(err);
        logger.warn(`mail to ${p.to} failed (${reason}); sending to fallback ${fallbackTo} instead`);
        const note =
          `<div style="font-family:Arial,sans-serif;font-size:13px;background:#fff8e1;border:1px solid #f0c36d;padding:10px;margin-bottom:16px">` +
          `This mail could not be delivered to <b>${escHtml(p.to)}</b> and was sent to the fallback inbox instead.<br>` +
          `Reason: ${escHtml(reason)}</div>`;
        await inner.send({ ...p, to: fallbackTo, subject: `[failed for: ${p.to}] ${p.subject}`, html: note + p.html });
      }
    },
  };
}

export function createMailTransport(env: Env = process.env): MailTransport {
  const provider = (env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
  let transport: MailTransport;
  if (provider === 'gmail') transport = new GmailTransport(env);
  else if (provider === 'resend') transport = new ResendTransport(env);
  else throw new Error(`EMAIL_PROVIDER must be "gmail" or "resend", got "${provider}"`);

  const redirect = env.EMAIL_DEV_REDIRECT_TO?.trim();
  return redirect ? withFallback(transport, redirect) : transport;
}