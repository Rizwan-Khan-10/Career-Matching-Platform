import { UnrecoverableError } from 'bullmq';
import axios from 'axios';
import { EmailWorker } from './email.worker';

jest.mock('bullmq', () => {
  class UnrecoverableError extends Error { }
  return { UnrecoverableError, Worker: jest.fn() };
});
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), isAxiosError: (e: any) => !!e?.isAxiosError } }));
jest.mock('../email/email.service', () => ({ EmailService: class {} }));

const get = axios.get as jest.Mock;

function build() {
  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEligible: jest.fn().mockResolvedValue(undefined),
    sendCandidateReady: jest.fn().mockResolvedValue(undefined),
    sendShortlisted: jest.fn().mockResolvedValue(undefined),
  };
  return { mail, worker: new EmailWorker(mail as any) };
}

describe('EmailWorker', () => {
  const env = { ...process.env };
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: { email: 'user@x.test' } });
    process.env.AUTH_SERVICE_URL = 'http://auth.test';
    process.env.INTERNAL_API_KEY = 'secret';
  });
  afterAll(() => { process.env = env; });

  it('password-reset goes straight to the address in the job (invite flag passed on)', async () => {
    const { mail, worker } = build();
    await worker.process({ name: 'password-reset', data: { email: 'a@x.test', resetToken: 't1' } });
    await worker.process({ name: 'password-reset', data: { email: 'b@x.test', resetToken: 't2', invite: true } });
    expect(mail.sendPasswordReset).toHaveBeenNthCalledWith(1, 'a@x.test', 't1', false);
    expect(mail.sendPasswordReset).toHaveBeenNthCalledWith(2, 'b@x.test', 't2', true);
    expect(get).not.toHaveBeenCalled();
  });

  it('eligibility-result looks the applicant up WITH x-internal-key and passes roleTitle on', async () => {
    const { mail, worker } = build();
    await worker.process({ name: 'eligibility-result', data: { applicantId: 'a1', jobRoleId: 'r1', eligible: true, roleTitle: 'Backend Dev' } });
    expect(get).toHaveBeenCalledWith('http://auth.test/internal/users/a1/email', { headers: { 'x-internal-key': 'secret' }, timeout: 10000 });
    expect(mail.sendEligible).toHaveBeenCalledWith('user@x.test', 'Backend Dev');
  });

  it('candidate-ready mails the company with applicantName, roleTitle, score and jobRoleId', async () => {
    const { mail, worker } = build();
    await worker.process({ name: 'candidate-ready', data: { companyId: 'c1', applicantName: 'Asha', roleTitle: 'Dev', score: 0.9, jobRoleId: 'r1' } });
    expect(get).toHaveBeenCalledWith('http://auth.test/internal/users/c1/email', expect.anything());
    expect(mail.sendCandidateReady).toHaveBeenCalledWith('user@x.test', { applicantName: 'Asha', roleTitle: 'Dev', score: 0.9, jobRoleId: 'r1' });
  });

  it('shortlisted mails the applicant with the shortlist object untouched', async () => {
    const { mail, worker } = build();
    const shortlist = { roundName: 'R1', mode: 'online' };
    await worker.process({ name: 'shortlisted', data: { applicantId: 'a1', matchId: 'm1', roleTitle: 'Dev', companyName: 'Acme', shortlist } });
    expect(mail.sendShortlisted).toHaveBeenCalledWith('user@x.test', { companyName: 'Acme', roleTitle: 'Dev', shortlist });
  });

  it('sends no x-internal-key header when INTERNAL_API_KEY is unset (local dev)', async () => {
    delete process.env.INTERNAL_API_KEY;
    const { worker } = build();
    await worker.process({ name: 'eligibility-result', data: { applicantId: 'a1' } });
    expect(get).toHaveBeenCalledWith(expect.any(String), { headers: {}, timeout: 10000 });
  });

  it.each(['feedback-guide', 'application-update', 'whatever'])('drops the removed/unknown job "%s" without sending anything', async (name) => {
    const { mail, worker } = build();
    await worker.process({ name, data: { applicantId: 'a1', feedback: 'x' } });
    for (const fn of Object.values(mail)) expect(fn).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('a deleted user (404 from auth-service) is not retried', async () => {
    get.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const { mail, worker } = build();
    await expect(worker.process({ name: 'shortlisted', data: { applicantId: 'gone' } })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mail.sendShortlisted).not.toHaveBeenCalled();
  });

  it('other lookup errors stay retryable (plain Error)', async () => {
    get.mockRejectedValue(new Error('ECONNREFUSED'));
    const { worker } = build();
    const err = await worker.process({ name: 'shortlisted', data: { applicantId: 'a1' } }).catch((e) => e);
    expect(err.message).toBe('ECONNREFUSED');
    expect(err).not.toBeInstanceOf(UnrecoverableError);
  });

  it('a job without recipient or token fails for good', async () => {
    const { worker } = build();
    await expect(worker.process({ name: 'shortlisted', data: {} })).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(worker.process({ name: 'password-reset', data: { email: 'a@x.test' } })).rejects.toBeInstanceOf(UnrecoverableError);
  });
});