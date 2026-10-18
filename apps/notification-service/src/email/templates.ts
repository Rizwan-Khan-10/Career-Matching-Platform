/**
 * Pure e-mail templates: (data) -> { subject, html }. No sending here, so every rule is unit-testable.
 * Everything that comes from an event, a company or an LLM is HTML-escaped; subjects are single-line.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Names / titles / company text end up inside HTML e-mails: never trust them. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One line, trimmed, clipped: safe for a subject and for a short label. */
const clean = (value: unknown, max = 80): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** A non-blank string, otherwise undefined. The text itself is NOT changed (company details go out verbatim). */
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
const base = (webUrl: string) => webUrl.replace(/\/+$/, '');
const multiline = (value: string) => esc(value).replace(/\r?\n/g, '<br/>');
/** Only http(s) becomes a clickable link: a `javascript:` link typed by a company must never reach an inbox. */
const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

export function passwordResetEmail(o: { webUrl: string; resetToken: string; invite?: boolean }): RenderedEmail {
  const link = `${base(o.webUrl)}/reset-password?token=${encodeURIComponent(o.resetToken)}`;
  if (o.invite) {
    return {
      subject: 'You have been invited: set your password',
      html: `<p>An account has been created for you on Career Match.</p>
             <p><a href="${esc(link)}">Set your password</a> to sign in (the link is valid for 7 days).</p>
             <p>If you were not expecting this, you can ignore this e-mail.</p>`,
    };
  }
  return {
    subject: 'Reset your password',
    html: `<p>We got a request to reset your password.</p>
           <p><a href="${esc(link)}">Choose a new password</a> (valid for 15 minutes).</p>
           <p>If this wasn't you, ignore this e-mail: your password stays the same.</p>`,
  };
}

export function eligibleEmail(o: { webUrl: string; roleTitle?: string | null }): RenderedEmail {
  const role = clean(o.roleTitle);
  return {
    subject: role ? `You are eligible for ${role}` : 'You are eligible for a role!',
    html: `<p>Great news: you matched ${role ? `<b>${esc(role)}</b>` : "a role's requirements"}.</p>
           <p>Open your dashboard to see the details. Your resume is only sent to the company
           <b>after you approve</b>: <a href="${esc(base(o.webUrl))}/applicant/matches">review the match</a>.</p>`,
  };
}

/**
 * The applicant approved sharing -> the company is only INFORMED. The resume itself is NOT e-mailed:
 * the company logs in, opens the candidate list and views/downloads the PDF there (access is checked server-side).
 */
export function candidateReadyEmail(o: {
  webUrl: string;
  applicantName?: string | null;
  roleTitle?: string | null;
  score?: number | null;
  jobRoleId?: string | null;
}): RenderedEmail {
  const who = clean(o.applicantName) || 'A candidate';
  const role = clean(o.roleTitle) || 'one of your open roles';
  const percent = typeof o.score === 'number' && Number.isFinite(o.score) ? ` (${Math.round(o.score * 100)}% match)` : '';
  const path = o.jobRoleId ? `/company/roles/${encodeURIComponent(o.jobRoleId)}/applicants` : '/company';
  return {
    subject: `New candidate ready for ${role}`,
    html: `<p><b>${esc(who)}</b> matched <b>${esc(role)}</b>${percent} and <b>approved sharing their resume</b> with you.</p>
           <p><a href="${esc(base(o.webUrl) + path)}">Log in to view the candidate and download the resume</a>.</p>`,
  };
}

const SHORTLIST_FIELDS: [key: string, label: string][] = [
  ['roundName', 'Round'],
  ['mode', 'Mode'],
  ['scheduledAt', 'When'],
  ['address', 'Address'],
  ['link', 'Link'],
  ['bring', 'Please bring'],
  ['note', 'Note from the company'],
];

/** The shortlist fields of contract §5.6 go out exactly as the company typed them (only HTML-escaped). */
export function shortlistedEmail(o: {
  webUrl: string;
  companyName?: string | null;
  roleTitle?: string | null;
  shortlist?: unknown;
}): RenderedEmail {
  const company = clean(o.companyName) || 'A company';
  const role = clean(o.roleTitle) || 'a role';
  const details = o.shortlist && typeof o.shortlist === 'object' && !Array.isArray(o.shortlist) ? (o.shortlist as Record<string, unknown>) : {};

  const rows = SHORTLIST_FIELDS.flatMap(([key, label]) => {
    const value = text(details[key]);
    if (value === undefined) return [];
    const shown = key === 'link' && isHttpUrl(value) ? `<a href="${esc(value.trim())}">${esc(value.trim())}</a>` : multiline(value);
    return [`<p><b>${label}:</b> ${shown}</p>`];
  });

  return {
    subject: `${company} shortlisted you for ${role}`,
    html: `<p>Congratulations! <b>${esc(company)}</b> shortlisted you for <b>${esc(role)}</b>.</p>
           ${rows.length ? `<p>Details from the company:</p>${rows.join('')}` : ''}
           <p><a href="${esc(base(o.webUrl))}/applicant/matches">Open your matches</a> for everything in one place.</p>`,
  };
}