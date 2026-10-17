import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { BACKEND_JAVA, javaBackendResume } from '../src/docs';
import { api, ok } from '../src/http';
import { eventually } from '../src/poll';
import { JAVA_BACKEND_ROLE, approvedCandidate, candidatesOf, myMatches, setupRole, waitForNotification } from '../src/scenario';

// The e-mails (candidate ready, shortlisted) need a mail catcher and are not asserted: see e2e/README.md.
describe('checkpoint 8: approve, shortlist, prep guide', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('the company sees the approved candidate, shortlists with the form, the applicant is notified and later gets a prep guide', async () => {
    const { company, role } = await setupRole('cp8', JAVA_BACKEND_ROLE);
    const { applicant, match, candidate } = await approvedCandidate(company, role, 'cp8', javaBackendResume('E2E Shortlist'), BACKEND_JAVA);

    expect(candidate.id).toBe(match.id);
    await waitForNotification(company, 'candidate_ready');

    // roundName and mode are required
    const invalid = await api(`/matches/${match.id}/decision`, {
      method: 'PATCH',
      token: company.token,
      json: { decision: 'shortlisted', shortlist: { mode: 'online' } },
    });
    expect(invalid.status).toBe(400);

    const scheduledAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    ok(
      await api(`/matches/${match.id}/decision`, {
        method: 'PATCH',
        token: company.token,
        json: {
          decision: 'shortlisted',
          shortlist: { roundName: 'Technical round 1', mode: 'online', scheduledAt, link: 'https://meet.example.com/e2e', bring: 'Laptop' },
        },
      }),
      'shortlist',
    );

    expect((await candidatesOf(company, role.id)).find((c) => c.id === match.id)?.decision).toBe('shortlisted');

    const note = await waitForNotification(applicant, 'shortlisted');
    expect(JSON.stringify(note)).toContain('Technical round 1');

    const mine = (await myMatches(applicant)).find((m) => m.id === match.id);
    expect(mine?.outcome).toBe('shortlisted');
    expect(mine?.shortlistInfo).toMatchObject({ roundName: 'Technical round 1', mode: 'online' });

    // "prep ready" arrives later (AI guide)
    await waitForNotification(applicant, 'prep_ready');
    const withGuide = await eventually('the prep guide is saved on the match', async () => {
      const m = (await myMatches(applicant)).find((x) => x.id === match.id);
      return m?.prepGuide ? m : null;
    });
    expect(withGuide.prepGuide!.length).toBeGreaterThan(20);
  });
});