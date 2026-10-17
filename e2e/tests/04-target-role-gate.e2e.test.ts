import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, BACKEND_PYTHON, javaBackendResume, pythonBackendResume } from '../src/docs';
import { confirmedResume, expectNoMatch, newApplicant, setupRole, waitForMatch } from '../src/scenario';

describe('checkpoint 4: the target role gate', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('a Java-Backend resume matches a backend/java role, a Python-Backend resume never does', async () => {
    // the required skills are ones BOTH resumes have, so only the gate can explain a difference
    const { role } = await setupRole('cp4', {
      title: 'Java Backend Engineer',
      requiredSkills: ['REST APIs', 'SQL', 'Git', 'Docker'],
      track: 'backend',
      stacks: ['java'],
    });

    const javaApplicant = await newApplicant('cp4-java');
    const pythonApplicant = await newApplicant('cp4-python');
    await confirmedResume(javaApplicant, javaBackendResume('E2E Java Dev'), BACKEND_JAVA);
    await confirmedResume(pythonApplicant, pythonBackendResume('E2E Python Dev'), BACKEND_PYTHON);

    const match = await waitForMatch(javaApplicant, role.id);
    expect(match.eligible).toBe(true);

    // matching ran for this role (the Java resume was scored): the Python resume must have been gated out
    await expectNoMatch(pythonApplicant, role.id);
  });
});