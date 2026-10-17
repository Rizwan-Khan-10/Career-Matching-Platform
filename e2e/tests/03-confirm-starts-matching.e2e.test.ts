import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, javaBackendResume } from '../src/docs';
import {
  JAVA_BACKEND_ROLE,
  confirmResume,
  expectNoMatch,
  newApplicant,
  setupRole,
  uploadResume,
  waitForMatch,
  waitParsed,
} from '../src/scenario';

describe('checkpoint 3: parse first, match only after confirm', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('a parsed resume does not match; after confirm it matches with an "unverified" CGPA flag', async () => {
    const { role } = await setupRole('cp3', { ...JAVA_BACKEND_ROLE, minCgpa: 7 });
    const applicant = await newApplicant('cp3');

    const uploaded = await uploadResume(applicant, javaBackendResume('E2E Student Three'), BACKEND_JAVA);
    const parsed = await waitParsed(applicant, uploaded.id);
    expect(parsed.confirmedAt).toBeNull();
    await expectNoMatch(applicant, role.id); // parsing alone must not start matching

    await confirmResume(applicant, uploaded.id);
    const match = await waitForMatch(applicant, role.id);

    // the role wants CGPA >= 7, the resume has no CGPA: still eligible, but flagged
    expect(match.eligible).toBe(true);
    expect(match.unverifiedRules).toContain('cgpa');
    expect(match.resumeId).toBe(uploaded.id);
    expect(match.resumeTargetLabel).toBe('Backend · Java');
  });
});