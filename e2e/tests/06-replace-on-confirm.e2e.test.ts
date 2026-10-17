import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, javaBackendResume } from '../src/docs';
import { api, ok } from '../src/http';
import { eventually } from '../src/poll';
import {
  JAVA_BACKEND_ROLE,
  approvedCandidate,
  confirmedResume,
  listResumes,
  newApplicant,
  setupRole,
  waitForMatch,
} from '../src/scenario';

// Cloudinary itself is not checked here (the suite has no Cloudinary access): see e2e/README.md for the manual check.
describe('checkpoint 6: a new resume for the same target role replaces the old one', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('removes the old resume and recomputes its non-approved matches', async () => {
    const { role } = await setupRole('cp6-plain', JAVA_BACKEND_ROLE);
    const applicant = await newApplicant('cp6-plain');
    const first = await confirmedResume(applicant, javaBackendResume('E2E Replace One'), BACKEND_JAVA);
    await waitForMatch(applicant, role.id, (m) => m.resumeId === first.id);

    const second = await confirmedResume(applicant, javaBackendResume('E2E Replace Two'), BACKEND_JAVA);

    await eventually('the old resume is gone', async () => {
      const resumes = await listResumes(applicant);
      return !resumes.some((r) => r.id === first.id) && resumes.some((r) => r.id === second.id && r.confirmedAt && !r.supersededAt);
    });
    // the match now points at the new resume
    const match = await waitForMatch(applicant, role.id, (m) => m.resumeId === second.id);
    expect(match.resumeId).toBe(second.id);
  });

  it('keeps the old resume (and its PDF) when an approved match still uses it', async () => {
    const { company, role } = await setupRole('cp6-approved', JAVA_BACKEND_ROLE);
    const { applicant, resume: first, match } = await approvedCandidate(company, role, 'cp6-approved', javaBackendResume('E2E Keep One'), BACKEND_JAVA);

    const second = await confirmedResume(applicant, javaBackendResume('E2E Keep Two'), BACKEND_JAVA);

    // replaced but not deleted: only marked as superseded
    const kept = await eventually('the old resume is marked superseded', async () => {
      const row = (await listResumes(applicant)).find((r) => r.id === first.id);
      return row?.supersededAt ? row : null;
    });
    expect(kept.id).toBe(first.id);
    expect((await listResumes(applicant)).some((r) => r.id === second.id && r.confirmedAt)).toBe(true);

    // the approved match is frozen on the old resume and the company can still download its PDF
    const frozen = await waitForMatch(applicant, role.id);
    expect(frozen.id).toBe(match.id);
    expect(frozen.resumeId).toBe(first.id);
    const link = await eventually('the company gets a PDF link for the old resume', async () => {
      const res = await api(`/resumes/${first.id}/pdf`, { token: company.token });
      return res.ok ? res.body : null;
    });
    expect(link.url).toEqual(expect.any(String));
  });
});