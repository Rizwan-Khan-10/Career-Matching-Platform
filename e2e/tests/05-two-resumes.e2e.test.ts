import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, FULLSTACK_JAVA, fullstackJavaResume, javaBackendResume } from '../src/docs';
import { JAVA_BACKEND_ROLE, addRole, companyWithPosting, confirmedResume, listResumes, newApplicant, waitForMatch } from '../src/scenario';

describe('checkpoint 5: two resumes for two target roles', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('both stay active and each role is matched with a compatible resume that the applicant can see', async () => {
    const { company, posting } = await companyWithPosting('cp5');
    // A backend/java role: both resumes are compatible (a full-stack resume can serve a backend role)
    const roleA = await addRole(company, posting.id, JAVA_BACKEND_ROLE);
    // A frontend role with no stack: only the full-stack resume is compatible (frontend and backend never match)
    const roleB = await addRole(company, posting.id, {
      title: 'Frontend Developer',
      requiredSkills: ['JavaScript', 'React', 'HTML', 'CSS'],
      track: 'frontend',
    });

    const applicant = await newApplicant('cp5');
    const backend = await confirmedResume(applicant, javaBackendResume('E2E Two Resumes'), BACKEND_JAVA);
    const fullstack = await confirmedResume(applicant, fullstackJavaResume('E2E Two Resumes'), FULLSTACK_JAVA);

    const resumes = await listResumes(applicant);
    for (const id of [backend.id, fullstack.id]) {
      const row = resumes.find((r) => r.id === id);
      expect(row?.confirmedAt).not.toBeNull();
      expect(row?.supersededAt).toBeNull(); // different target roles: both are active
    }

    const matchB = await waitForMatch(applicant, roleB.id);
    expect(matchB.resumeId).toBe(fullstack.id);
    expect(matchB.resumeTargetLabel).toBe('Full-stack · Java');

    // one match per (applicant, role): whichever resume scored better, the applicant is told which one
    const matchA = await waitForMatch(applicant, roleA.id);
    expect([backend.id, fullstack.id]).toContain(matchA.resumeId);
    const used = resumes.find((r) => r.id === matchA.resumeId);
    expect(matchA.resumeTargetLabel).toBe(used?.targetLabel);
  });
});