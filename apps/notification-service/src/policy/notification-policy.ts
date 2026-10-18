export type NotificationType =
  | 'resume_ready' | 'roles_ready' | 'match_eligible' | 'feedback_ready' | 'candidate_ready' | 'shortlisted'
  | 'prep_ready' | 'rejected' | 'rejection_feedback_ready' | 'company_status' | 'job_approval';

export interface EmailJob {
  name: string;
  data: Record<string, unknown>;
  /** Same jobId = BullMQ queues it only once. No ":" allowed in a BullMQ job id. */
  jobId?: string;
}

export interface PlannedNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Unique per (userId, dedupeKey): the same event twice makes one row. */
  dedupeKey: string;
  email?: EmailJob;
}

export interface EventContext {
  stream: string;
  /** Redis stream entry id: stable across redeliveries of the same event. */
  streamId: string;
}

export type EventData = Record<string, unknown>;
type Rule = (data: EventData, ctx: EventContext) => PlannedNotification | null;

export const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const roleText = (title: string | undefined, fallback: string) =>
  title ? clip(title.replace(/\s+/g, ' '), 80) : fallback;

/** One match = one applicant + one job role (contract §4.7). */
const matchKey = (applicantId: string, jobRoleId: string) => `${applicantId}:${jobRoleId}`;
/** For events without a natural id (status changes): the stream id dedupes redeliveries but not later changes. */
const streamKey = (ctx: EventContext) => `${ctx.stream}:${ctx.streamId}`;

const resumeParsed: Rule = (d) => {
  const applicantId = str(d.applicantId);
  const resumeId = str(d.resumeId);
  if (!applicantId || !resumeId) return null;
  return {
    userId: applicantId,
    type: 'resume_ready',
    title: 'Review and confirm your resume',
    body: 'We have read your resume. Check the details and confirm it to start matching.',
    data: { resumeId },
    dedupeKey: `resume:${resumeId}`,
  };
};

const jdExtracted: Rule = (d) => {
  const companyId = str(d.companyId);
  const jobPostingId = str(d.jobPostingId);
  if (!companyId || !jobPostingId) return null;
  return {
    userId: companyId,
    type: 'roles_ready',
    title: 'Your roles are ready',
    body: 'Review the roles we extracted from your job description.',
    data: { jobPostingId, roleCount: Array.isArray(d.roleIds) ? d.roleIds.length : 0 },
    dedupeKey: `jd:${jobPostingId}`,
  };
};

const matchComputed: Rule = (d) => {
  if (d.eligible !== true) return null; // not eligible: no in-app row, no e-mail
  const applicantId = str(d.applicantId);
  const jobRoleId = str(d.jobRoleId);
  if (!applicantId || !jobRoleId) return null;
  const roleTitle = str(d.roleTitle);
  return {
    userId: applicantId,
    type: 'match_eligible',
    title: 'You are eligible for a role',
    body: `You match ${roleText(roleTitle, 'a role')}. Review the match and approve sharing your resume if you are interested.`,
    data: { jobRoleId, roleTitle: roleTitle ?? null, resumeId: str(d.resumeId) ?? null, score: num(d.score) ?? null },
    dedupeKey: matchKey(applicantId, jobRoleId), // first time only (contract §7)
    email: {
      name: 'eligibility-result',
      data: { applicantId, jobRoleId, eligible: true },
      jobId: `eligibility-${applicantId}-${jobRoleId}`,
    },
  };
};

const feedbackReady: Rule = (d) => {
  const applicantId = str(d.applicantId);
  const jobRoleId = str(d.jobRoleId);
  if (!applicantId || !jobRoleId) return null;
  return {
    userId: applicantId,
    type: 'feedback_ready',
    title: 'Your improvement guide is ready',
    body: 'Your personalized guide for a role is ready. Open your matches to read it.',
    data: { jobRoleId },
    dedupeKey: `feedback:${matchKey(applicantId, jobRoleId)}`,
  };
};

const candidateReady: Rule = (d, ctx) => {
  const companyId = str(d.companyId);
  if (!companyId) return null;
  const matchId = str(d.matchId);
  const jobRoleId = str(d.jobRoleId);
  const roleTitle = str(d.roleTitle);
  const applicantName = str(d.applicantName);
  const score = num(d.score);
  const percent = score === undefined ? '' : ` (${Math.round(score * 100)}% match)`;
  return {
    userId: companyId,
    type: 'candidate_ready',
    title: 'A candidate is ready',
    body: `${clip(applicantName ?? 'A candidate', 80)} approved sharing their resume for ${roleText(roleTitle, 'one of your roles')}${percent}.`,
    data: { matchId: matchId ?? null, jobRoleId: jobRoleId ?? null, roleTitle: roleTitle ?? null, applicantName: applicantName ?? null, score: score ?? null },
    dedupeKey: matchId ? `candidate:${matchId}` : streamKey(ctx),
    email: {
      name: 'candidate-ready',
      data: { companyId, matchId, jobRoleId, roleTitle, applicantName, score },
      jobId: matchId ? `candidate-ready-${matchId}` : undefined,
    },
  };
};

const candidateShortlisted: Rule = (d, ctx) => {
  const applicantId = str(d.applicantId);
  if (!applicantId) return null;
  const matchId = str(d.matchId);
  const roleTitle = str(d.roleTitle);
  const companyName = str(d.companyName);
  return {
    userId: applicantId,
    type: 'shortlisted',
    title: 'You were shortlisted',
    body: `${clip(companyName ?? 'A company', 80)} shortlisted you for ${roleText(roleTitle, 'a role')}.`,
    data: {
      matchId: matchId ?? null, jobRoleId: str(d.jobRoleId) ?? null, companyId: str(d.companyId) ?? null,
      roleTitle: roleTitle ?? null, companyName: companyName ?? null, shortlist: d.shortlist ?? null,
    },
    dedupeKey: matchId ? `shortlisted:${matchId}` : streamKey(ctx),
    email: {
      name: 'shortlisted',
      // `shortlist` = the company's details, passed on verbatim for the e-mail
      data: { applicantId, matchId: matchId ?? null, roleTitle: roleTitle ?? null, companyName: companyName ?? null, shortlist: d.shortlist ?? null },
      jobId: matchId ? `shortlisted-${matchId}` : undefined,
    },
  };
};

const prepReady: Rule = (d, ctx) => {
  const applicantId = str(d.applicantId);
  if (!applicantId) return null;
  const matchId = str(d.matchId);
  return {
    userId: applicantId,
    type: 'prep_ready',
    title: 'Your interview prep guide is ready',
    body: 'Open your matches to read your preparation guide.',
    data: { matchId: matchId ?? null, jobRoleId: str(d.jobRoleId) ?? null },
    dedupeKey: matchId ? `prep:${matchId}` : streamKey(ctx),
  };
};

const candidateRejected: Rule = (d, ctx) => {
  const applicantId = str(d.applicantId);
  if (!applicantId) return null;
  const matchId = str(d.matchId);
  const roleTitle = str(d.roleTitle);
  return {
    userId: applicantId,
    type: 'rejected',
    title: 'Application update',
    body: `Your application for ${roleText(roleTitle, 'a role')} was not taken forward. Open the match for details.`,
    data: { matchId: matchId ?? null, jobRoleId: str(d.jobRoleId) ?? null, roleTitle: roleTitle ?? null, reasonCategory: str(d.reasonCategory) ?? null },
    dedupeKey: matchId ? `rejected:${matchId}` : streamKey(ctx),
  };
};

const rejectionFeedbackReady: Rule = (d, ctx) => {
  const applicantId = str(d.applicantId);
  if (!applicantId || !str(d.feedback)) return null; // feedback is null for position_filled / other: nothing to tell
  const matchId = str(d.matchId);
  return {
    userId: applicantId,
    type: 'rejection_feedback_ready',
    title: 'Feedback on your application',
    body: 'Your personalized feedback is ready. Open the match to read it.',
    data: { matchId: matchId ?? null, jobRoleId: str(d.jobRoleId) ?? null },
    dedupeKey: matchId ? `rejection-feedback:${matchId}` : streamKey(ctx),
  };
};

const COMPANY_STATUS_TEXT = new Map<string, [string, string]>([
  ['approved', ['Your company was approved', 'You can now post jobs and find candidates.']],
  ['rejected', ['Your company was not approved', 'Please contact your administrator for details.']],
  ['pending', ['Your company is waiting for approval', 'An administrator will review your account soon.']],
]);

const companyStatusChanged: Rule = (d, ctx) => {
  const companyId = str(d.companyId);
  const status = str(d.status);
  const text = status ? COMPANY_STATUS_TEXT.get(status) : undefined;
  if (!companyId || !status || !text) return null;
  return {
    userId: companyId,
    type: 'company_status',
    title: text[0],
    body: text[1],
    data: { status },
    dedupeKey: streamKey(ctx), // an admin may approve, reject and approve again: each is a new notification
  };
};

const JOB_STATUS_TEXT = new Map<string, [string, string]>([
  ['approved', ['Your job posting was approved', 'Your job posting is now live.']],
  ['rejected', ['Your job posting was not approved', 'Review the note and update your posting.']],
  ['pending', ['Your job posting is waiting for approval', 'An administrator will review it soon.']],
]);

const jobApprovalChanged: Rule = (d, ctx) => {
  const companyId = str(d.companyId);
  const jobPostingId = str(d.jobPostingId);
  const status = str(d.status);
  const text = status ? JOB_STATUS_TEXT.get(status) : undefined;
  if (!companyId || !jobPostingId || !status || !text) return null;
  const note = str(d.note);
  return {
    userId: companyId,
    type: 'job_approval',
    title: text[0],
    body: clip(note ? `${text[1]} Note from the administrator: ${note}` : text[1], 500),
    data: { jobPostingId, status, note: note ?? null },
    dedupeKey: streamKey(ctx),
  };
};

/** Contract §7: one rule per event. A stream that is not here is not consumed. */
export const POLICY = new Map<string, Rule>([
  ['resume.parsed', resumeParsed],
  ['jd.extracted', jdExtracted],
  ['match.computed', matchComputed],
  ['feedback.ready', feedbackReady],
  ['candidate.ready', candidateReady],
  ['candidate.shortlisted', candidateShortlisted],
  ['prep.ready', prepReady],
  ['candidate.rejected', candidateRejected],
  ['rejection-feedback.ready', rejectionFeedbackReady],
  ['company.status.changed', companyStatusChanged],
  ['job.approval.changed', jobApprovalChanged],
]);

export const CONSUMED_STREAMS = [...POLICY.keys()];
