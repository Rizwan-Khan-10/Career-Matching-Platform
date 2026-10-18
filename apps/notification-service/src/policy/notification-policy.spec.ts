import { CONSUMED_STREAMS, POLICY } from './notification-policy';

const run = (stream: string, data: Record<string, unknown>, streamId = '1-0') =>
  POLICY.get(stream)!(data, { stream, streamId });

describe('notification policy (contract §7)', () => {
  it('covers exactly the eleven streams of the task', () => {
    expect([...CONSUMED_STREAMS].sort()).toEqual([
      'candidate.ready', 'candidate.rejected', 'candidate.shortlisted', 'company.status.changed', 'feedback.ready',
      'jd.extracted', 'job.approval.changed', 'match.computed', 'prep.ready', 'rejection-feedback.ready', 'resume.parsed',
    ]);
  });

  it('resume.parsed -> applicant, "Review and confirm your resume", no e-mail', () => {
    expect(run('resume.parsed', { resumeId: 'r1', applicantId: 'a1', skills: [] })).toMatchObject({
      userId: 'a1', type: 'resume_ready', title: 'Review and confirm your resume',
      data: { resumeId: 'r1' }, dedupeKey: 'resume:r1',
    });
    expect(run('resume.parsed', { resumeId: 'r1', applicantId: 'a1' })!.email).toBeUndefined();
  });

  it('jd.extracted -> company roles_ready, no e-mail', () => {
    const plan = run('jd.extracted', { jobPostingId: 'j1', companyId: 'c1', roleIds: ['x', 'y'] })!;
    expect(plan).toMatchObject({ userId: 'c1', type: 'roles_ready', data: { jobPostingId: 'j1', roleCount: 2 }, dedupeKey: 'jd:j1' });
    expect(plan.email).toBeUndefined();
  });

  describe('match.computed', () => {
    const base = { applicantId: 'a1', jobRoleId: 'role1', roleTitle: 'Backend Dev', resumeId: 'r1', score: 0.82 };

    it('eligible=true -> match_eligible with an e-mail, deduped by the match key', () => {
      expect(run('match.computed', { ...base, eligible: true })).toMatchObject({
        userId: 'a1', type: 'match_eligible', dedupeKey: 'a1:role1',
        email: { name: 'eligibility-result', data: { applicantId: 'a1', jobRoleId: 'role1', eligible: true } },
      });
    });

    it('eligible=false -> nothing at all', () => {
      expect(run('match.computed', { ...base, eligible: false })).toBeNull();
      expect(run('match.computed', { ...base })).toBeNull();
    });

    it('gives match_eligible and feedback_ready different dedupe keys for the same applicant and role', () => {
      const eligible = run('match.computed', { ...base, eligible: true })!;
      const feedback = run('feedback.ready', { applicantId: 'a1', jobRoleId: 'role1', feedback: 'text' })!;
      expect(feedback).toMatchObject({ type: 'feedback_ready', userId: 'a1' });
      expect(feedback.email).toBeUndefined();
      expect(feedback.dedupeKey).not.toBe(eligible.dedupeKey);
    });
  });

  it('candidate.ready -> company e-mail, queued once per match', () => {
    const plan = run('candidate.ready', {
      companyId: 'c1', matchId: 'm1', jobRoleId: 'role1', roleTitle: 'Dev', applicantName: 'Asha', score: 0.9,
    })!;
    expect(plan).toMatchObject({
      userId: 'c1', type: 'candidate_ready', dedupeKey: 'candidate:m1',
      email: { name: 'candidate-ready', jobId: 'candidate-ready-m1', data: { companyId: 'c1', applicantName: 'Asha', score: 0.9 } },
    });
    expect(plan.body).toContain('Asha');
    expect(plan.body).toContain('90% match');
  });

  it('candidate.ready still works when applicantName and score are not in the payload yet', () => {
    const plan = run('candidate.ready', { companyId: 'c1', matchId: 'm1', jobRoleId: 'role1', roleTitle: 'Dev' })!;
    expect(plan.body).toBe('A candidate approved sharing their resume for Dev.');
  });

  it('candidate.shortlisted -> applicant e-mail with the company details verbatim', () => {
    const shortlist = { contact: 'hr@acme.com', message: 'Interview on Monday' };
    const plan = run('candidate.shortlisted', {
      matchId: 'm1', applicantId: 'a1', jobRoleId: 'role1', companyId: 'c1', roleTitle: 'Dev', companyName: 'Acme', shortlist,
    })!;
    expect(plan).toMatchObject({ userId: 'a1', type: 'shortlisted', dedupeKey: 'shortlisted:m1' });
    expect(plan.email).toEqual({
      name: 'shortlisted', jobId: 'shortlisted-m1',
      data: { applicantId: 'a1', matchId: 'm1', roleTitle: 'Dev', companyName: 'Acme', shortlist },
    });
    expect(plan.body).toBe('Acme shortlisted you for Dev.');
  });

  it('prep.ready and candidate.rejected -> applicant, no e-mail', () => {
    const prep = run('prep.ready', { matchId: 'm1', applicantId: 'a1', jobRoleId: 'role1', guide: '...' })!;
    const rejected = run('candidate.rejected', {
      matchId: 'm1', applicantId: 'a1', jobRoleId: 'role1', roleTitle: 'Dev', reasonCategory: 'position_filled', message: 'secret note',
    })!;
    expect(prep).toMatchObject({ type: 'prep_ready', userId: 'a1', dedupeKey: 'prep:m1' });
    expect(rejected).toMatchObject({ type: 'rejected', userId: 'a1', dedupeKey: 'rejected:m1' });
    expect(prep.email).toBeUndefined();
    expect(rejected.email).toBeUndefined();
    expect(JSON.stringify(rejected)).not.toContain('secret note'); // the company's message stays out of the notification
  });

  it('rejection-feedback.ready -> only when there is feedback text', () => {
    const base = { matchId: 'm1', applicantId: 'a1', jobRoleId: 'role1' };
    expect(run('rejection-feedback.ready', { ...base, feedback: null })).toBeNull();
    expect(run('rejection-feedback.ready', { ...base, feedback: '  ' })).toBeNull();
    expect(run('rejection-feedback.ready', { ...base, feedback: 'Work on system design' })).toMatchObject({
      type: 'rejection_feedback_ready', userId: 'a1', dedupeKey: 'rejection-feedback:m1',
    });
  });

  it('company.status.changed -> company notification per status, a new one for every change', () => {
    const approved = run('company.status.changed', { companyId: 'c1', status: 'approved' }, '5-0')!;
    const again = run('company.status.changed', { companyId: 'c1', status: 'approved' }, '9-0')!;
    expect(approved).toMatchObject({ userId: 'c1', type: 'company_status', title: 'Your company was approved', data: { status: 'approved' } });
    expect(approved.dedupeKey).not.toBe(again.dedupeKey);
    expect(run('company.status.changed', { companyId: 'c1', status: 'rejected' })!.title).toBe('Your company was not approved');
    expect(run('company.status.changed', { companyId: 'c1', status: 'constructor' })).toBeNull();
  });

  it('job.approval.changed -> company notification that carries the admin note', () => {
    const plan = run('job.approval.changed', { companyId: 'c1', jobPostingId: 'j1', status: 'rejected', note: 'Add salary range' })!;
    expect(plan).toMatchObject({ userId: 'c1', type: 'job_approval', data: { jobPostingId: 'j1', status: 'rejected', note: 'Add salary range' } });
    expect(plan.body).toContain('Add salary range');
    expect(run('job.approval.changed', { companyId: 'c1', jobPostingId: 'j1', status: 'weird' })).toBeNull();
  });

  it('skips events that miss the id of the recipient', () => {
    expect(run('resume.parsed', { resumeId: 'r1' })).toBeNull();
    expect(run('jd.extracted', { jobPostingId: 'j1' })).toBeNull();
    expect(run('candidate.ready', { matchId: 'm1' })).toBeNull();
    expect(run('candidate.shortlisted', { matchId: 'm1' })).toBeNull();
  });

  it('cleans up long role titles', () => {
    const plan = run('match.computed', { applicantId: 'a1', jobRoleId: 'r', eligible: true, roleTitle: `Dev\n\n${'x'.repeat(200)}` })!;
    expect(plan.body).not.toContain('\n');
    expect(plan.body.length).toBeLessThan(220);
  });
});
