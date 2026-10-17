import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { matchingStats, skippedByHash } from '../src/agent';
import { config } from '../src/config';
import { BACKEND_JAVA, javaBackendResume } from '../src/docs';
import { api, ok } from '../src/http';
import { eventually } from '../src/poll';
import { JAVA_BACKEND_ROLE, candidateWithMatch, myMatches, setupRole } from '../src/scenario';

// matching-agent is internal: set E2E_MATCHING_AGENT_URL and E2E_INTERNAL_API_KEY (see e2e/.env.example)
describe('checkpoint 11: unchanged pairs are not re-scored', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it.skipIf(!config.internalApiKey)(
    're-sending an unchanged role raises skipped-by-hash and keeps the score',
    async () => {
      const { company, role } = await setupRole('cp11', JAVA_BACKEND_ROLE);
      const { applicant, match } = await candidateWithMatch(role, 'cp11', javaBackendResume('E2E Hash'), BACKEND_JAVA);
      const before = skippedByHash(await matchingStats());

      // the same content again: job-service publishes jd.extracted, matching-agent finds the same input hash
      ok(
        await api(`/jobs/roles/${role.id}`, {
          method: 'PATCH',
          token: company.token,
          json: { title: JAVA_BACKEND_ROLE.title, requiredSkills: JAVA_BACKEND_ROLE.requiredSkills },
        }),
        'PATCH role with the same content',
      );

      await eventually('skipped-by-hash grows', async () => skippedByHash(await matchingStats()) > before);
      expect(skippedByHash(await matchingStats())).toBeGreaterThan(0);

      const after = (await myMatches(applicant)).find((m) => m.jobRoleId === role.id);
      expect(after?.score).toBe(match.score);
    },
  );
});