import { expect } from 'vitest';
import { adminActor, setCompanyStatus } from './admin';
import { signup, type Actor } from './actors';
import { jobDescription, textForm, type Target, type TextDoc } from './docs';
import { api, ok } from './http';
import { Fatal, eventually, sleep } from './poll';
import { config } from './config';

export interface ResumeRow {
  id: string;
  status: string;
  targetTrack: string;
  targetStack: string;
  targetLabel?: string;
  confirmedAt: string | null;
  supersededAt: string | null;
}

export interface MatchRow {
  id: string;
  jobRoleId: string;
  resumeId: string | null;
  eligible: boolean;
  score: number;
  outcome: 'shortlisted' | 'rejected' | null;
  unverifiedRules: string[];
  resumeTargetLabel: string | null;
  shortlistInfo: Record<string, any> | null;
  prepGuide: string | null;
  rejectionMessage: string | null;
  rejectionFeedback: string | null;
  [key: string]: unknown;
}

export interface Candidate {
  id: string;
  applicantId: string;
  resumeId: string | null;
  resumeStatus?: string;
  decision?: 'shortlisted' | 'rejected' | null;
  [key: string]: unknown;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any> | null;
  readAt: string | null;
}

export interface RoleSpec {
  title: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  track?: string;
  stacks?: string[];
  minCgpa?: number;
}

export const JAVA_BACKEND_ROLE: RoleSpec = {
  title: 'Java Backend Developer',
  requiredSkills: ['Java', 'Spring Boot', 'REST APIs', 'SQL'],
  preferredSkills: ['Docker', 'Git'],
  track: 'backend',
  stacks: ['java'],
};

// ---------- companies and jobs ----------

export const newApplicant = (label: string) => signup('APPLICANT', label);
export const newCompany = (label: string) => signup('COMPANY', label);

export function uploadJobDoc(company: Actor, title = 'Backend Developer') {
  return api('/jobs/upload', { method: 'POST', token: company.token, form: textForm(jobDescription(title)) });
}

/**
 * A company that can post jobs. If the company starts pending, the admin approves it; job-service caches the
 * company status for up to 60 s, so the first uploads may still answer 403 for a while.
 */
export async function companyWithPosting(label: string) {
  const company = await newCompany(label);
  const me = ok(await api('/companies/me', { token: company.token }), 'GET /companies/me');
  if (me.status === 'pending') await setCompanyStatus(company.userId, 'approved');
  const posting = await eventually(
    'the company can upload a job document',
    async () => {
      const res = await uploadJobDoc(company);
      if (res.status === 403) return null;
      return ok(res, 'POST /jobs/upload');
    },
    { timeoutMs: 90_000, intervalMs: 5000 },
  );
  return { company, posting: posting as { id: string } };
}

export async function addRole(company: Actor, postingId: string, spec: RoleSpec): Promise<{ id: string; title: string }> {
  return ok(
    await api(`/jobs/${postingId}/roles`, { method: 'POST', token: company.token, json: { preferredSkills: [], ...spec } }),
    'POST /jobs/:id/roles',
  );
}

export async function setupRole(label: string, spec: RoleSpec) {
  const { company, posting } = await companyWithPosting(label);
  const role = await addRole(company, posting.id, spec);
  return { company, posting, role };
}

// ---------- resumes ----------

export const listResumes = async (applicant: Actor): Promise<ResumeRow[]> =>
  ok(await api('/resumes/mine', { token: applicant.token }), 'GET /resumes/mine');

export async function uploadResume(applicant: Actor, doc: TextDoc, target: Target): Promise<ResumeRow> {
  const form = textForm(doc, { targetTrack: target.track, targetStack: target.stack });
  return ok(await api('/resumes/upload', { method: 'POST', token: applicant.token, form }), 'POST /resumes/upload');
}

export async function waitParsed(applicant: Actor, resumeId: string): Promise<ResumeRow> {
  return eventually(`resume ${resumeId} is parsed`, async () => {
    const resume = (await listResumes(applicant)).find((r) => r.id === resumeId);
    if (resume?.status === 'failed') throw new Fatal('the resume failed to parse: is resume-parser-agent running and GROQ_API_KEY set?');
    return resume?.status === 'parsed' ? resume : null;
  });
}

export async function confirmResume(applicant: Actor, resumeId: string) {
  return ok(await api(`/resumes/${resumeId}/confirm`, { method: 'POST', token: applicant.token }), 'POST /resumes/:id/confirm');
}

/** upload -> wait until parsed -> confirm (this is what starts matching) */
export async function confirmedResume(applicant: Actor, doc: TextDoc, target: Target): Promise<ResumeRow> {
  const uploaded = await uploadResume(applicant, doc, target);
  await waitParsed(applicant, uploaded.id);
  await confirmResume(applicant, uploaded.id);
  return uploaded;
}

// ---------- matches ----------

export const myMatches = async (applicant: Actor): Promise<MatchRow[]> =>
  ok(await api('/matches/mine', { token: applicant.token }), 'GET /matches/mine');

export function waitForMatch(applicant: Actor, roleId: string, extra: (m: MatchRow) => boolean = () => true): Promise<MatchRow> {
  return eventually(`a match for role ${roleId}`, async () => (await myMatches(applicant)).find((m) => m.jobRoleId === roleId && extra(m)));
}

/** Waits a while, then checks that no match for the role exists (used for "must never match"). */
export async function expectNoMatch(applicant: Actor, roleId: string) {
  await sleep(config.quietMs);
  expect((await myMatches(applicant)).find((m) => m.jobRoleId === roleId)).toBeUndefined();
}

export async function approveMatch(applicant: Actor, matchId: string) {
  return ok(
    await api(`/matches/${matchId}/approval`, { method: 'PATCH', token: applicant.token, json: { approved: true } }),
    'PATCH /matches/:id/approval',
  );
}

export const candidatesOf = async (company: Actor, roleId: string): Promise<Candidate[]> =>
  ok(await api(`/matches/role/${roleId}`, { token: company.token }), 'GET /matches/role/:id');

export function waitForCandidate(company: Actor, roleId: string, matchId: string): Promise<Candidate> {
  return eventually(`candidate ${matchId} visible to the company`, async () =>
    (await candidatesOf(company, roleId)).find((c) => c.id === matchId),
  );
}

// ---------- notifications ----------

export const notificationsOf = async (actor: Actor, query: Record<string, string | number> = {}): Promise<NotificationRow[]> => {
  const body = ok(await api('/notifications', { token: actor.token, query: { limit: 100, ...query } }), 'GET /notifications');
  return body.items;
};

export function waitForNotification(actor: Actor, type: string, extra: (n: NotificationRow) => boolean = () => true) {
  return eventually(`a "${type}" notification`, async () => (await notificationsOf(actor)).find((n) => n.type === type && extra(n)));
}

// ---------- a candidate who approved sharing the resume ----------

export async function candidateWithMatch(role: { id: string }, label: string, doc: TextDoc, target: Target) {
  const applicant = await newApplicant(label);
  const resume = await confirmedResume(applicant, doc, target);
  const match = await waitForMatch(applicant, role.id);
  return { applicant, resume, match };
}

export async function approvedCandidate(
  company: Actor,
  role: { id: string },
  label: string,
  doc: TextDoc,
  target: Target,
) {
  const { applicant, resume, match } = await candidateWithMatch(role, label, doc, target);
  await approveMatch(applicant, match.id);
  const candidate = await waitForCandidate(company, role.id, match.id);
  return { applicant, resume, match, candidate };
}

export { adminActor };