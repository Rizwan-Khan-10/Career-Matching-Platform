import { EmailQueueService } from './email-queue.service';

const add = jest.fn().mockResolvedValue(undefined);
jest.mock('bullmq', () => ({ Queue: jest.fn().mockImplementation(() => ({ add })) }));

describe('EmailQueueService', () => {
  beforeEach(() => add.mockClear());

  it('queues the job with its jobId so BullMQ never queues it twice', async () => {
    await new EmailQueueService().enqueue({ name: 'candidate-ready', data: { companyId: 'c1' }, jobId: 'candidate-ready-m1' });
    expect(add).toHaveBeenCalledWith('candidate-ready', { companyId: 'c1' }, { jobId: 'candidate-ready-m1' });
  });

  it('queues a job without a jobId', async () => {
    await new EmailQueueService().enqueue({ name: 'shortlisted', data: {} });
    expect(add).toHaveBeenCalledWith('shortlisted', {}, undefined);
  });
});
