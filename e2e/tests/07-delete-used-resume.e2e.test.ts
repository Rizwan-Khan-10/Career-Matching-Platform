import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, javaBackendResume } from '../src/docs';
import { api } from '../src/http';
import { JAVA_BACKEND_ROLE, approvedCandidate, listResumes, setupRole } from '../src/scenario';

describe('checkpoint 7: deleting a resume used by an approved match', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('answers 409 and keeps the resume', async () => {
    const { company, role } = await setupRole('cp7', JAVA_BACKEND_ROLE);
    const { applicant, resume } = await approvedCandidate(company, role, 'cp7', javaBackendResume('E2E Delete'), BACKEND_JAVA);

    const res = await api(`/resumes/${resume.id}`, { method: 'DELETE', token: applicant.token });
    expect(res.status).toBe(409);
    expect((await listResumes(applicant)).some((r) => r.id === resume.id)).toBe(true);
  });
});