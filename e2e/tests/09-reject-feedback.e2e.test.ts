import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { config } from '../src/config';
import { BACKEND_JAVA, javaBackendResume } from '../src/docs';
import { api, ok } from '../src/http';
import { eventually, sleep } from '../src/poll';
import { JAVA_BACKEND_ROLE, approvedCandidate, myMatches, notificationsOf, setupRole, waitForNotification } from '../src/scenario';

describe('checkpoint 9: rejection feedback', () => {
  beforeAll(() => applySettings(TEST_DEFAULTS));

  it('skills_gap gets in-app AI feedback, position_filled only the polite message', async () => {
    const { company, role } = await setupRole('cp9', JAVA_BACKEND_ROLE);
    const gap = await approvedCandidate(company, role, 'cp9-gap', javaBackendResume('E2E Reject Gap'), BACKEND_JAVA);
    const filled = await approvedCandidate(company, role, 'cp9-filled', javaBackendResume('E2E Reject Filled'), BACKEND_JAVA);

    // skills_gap: message + AI feedback
    ok(
      await api(`/matches/${gap.match.id}/decision`, {
        method: 'PATCH',
        token: company.token,
        json: { decision: 'rejected', rejection: { reasonCategory: 'skills_gap', message: 'We need more cloud experience.' } },
      }),
      'reject skills_gap',
    );
    await waitForNotification(gap.applicant, 'rejected');
    await waitForNotification(gap.applicant, 'rejection_feedback_ready');
    const gapMatch = await eventually('rejection feedback is saved', async () => {
      const m = (await myMatches(gap.applicant)).find((x) => x.id === gap.match.id);
      return m?.rejectionFeedback ? m : null;
    });
    expect(gapMatch.outcome).toBe('rejected');
    expect(gapMatch.rejectionMessage).toBe('We need more cloud experience.');
    expect(gapMatch).not.toHaveProperty('rejectReason'); // the private reason never reaches the applicant

    // position_filled: only the polite message, no AI feedback, no feedback notification
    ok(
      await api(`/matches/${filled.match.id}/decision`, {
        method: 'PATCH',
        token: company.token,
        json: { decision: 'rejected', rejection: { reasonCategory: 'position_filled' } },
      }),
      'reject position_filled',
    );
    await waitForNotification(filled.applicant, 'rejected');
    await sleep(config.quietMs);
    const filledMatch = (await myMatches(filled.applicant)).find((x) => x.id === filled.match.id);
    expect(filledMatch?.outcome).toBe('rejected');
    expect(filledMatch?.rejectionFeedback).toBeNull();
    expect(filledMatch).not.toHaveProperty('rejectReason');
    expect((await notificationsOf(filled.applicant)).some((n) => n.type === 'rejection_feedback_ready')).toBe(false);
  });
});