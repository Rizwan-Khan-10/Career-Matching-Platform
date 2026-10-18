import { INVITE_TOKEN_TTL_SECONDS, UserImportService } from './user-import.service';

function build(opts: { existing?: string[]; createProfile?: ReturnType<typeof vi.fn> } = {}) {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue((opts.existing ?? []).map((email) => ({ email }))),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: `id-${data.email}` })),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const redis = { client: { set: vi.fn().mockResolvedValue('OK') } };
  const mail = { enqueueInvite: vi.fn().mockResolvedValue(undefined) };
  const userService = {
    createProfile: opts.createProfile ?? vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
  };
  const service = new UserImportService(prisma as any, redis as any, mail as any, userService as any);
  return { service, prisma, redis, mail, userService };
}

const student = { email: 'Stud@College.edu ', role: 'APPLICANT', name: 'Stud', cgpa: '8.2', branch: 'CSE', passingYear: '2026', backlogs: '0' };
const company = { email: 'hr@acme.com', role: 'COMPANY', name: 'Acme' };

describe('UserImportService', () => {
  it('counts created and skipped rows and gives readable reasons', async () => {
    const { service } = build({ existing: ['old@college.edu'] });
    const result = await service.importUsers('admin-1', [
      student,
      company,
      { email: 'old@college.edu', role: 'APPLICANT' },
      { email: 'stud@college.edu', role: 'APPLICANT' },
      { email: 'not-an-email', role: 'APPLICANT' },
      { email: 'boss@college.edu', role: 'ADMIN' },
    ]);

    expect(result.created.map((c) => c.email)).toEqual(['stud@college.edu', 'hr@acme.com']);
    expect(result.skipped.map((s) => s.email)).toEqual(['old@college.edu', 'stud@college.edu', 'not-an-email', 'boss@college.edu']);
    expect(result.skipped[0].reason).toBe('Email already registered');
    expect(result.skipped[1].reason).toBe('Duplicate email in this file');
    expect(result.skipped[2].reason).toContain('Invalid email');
    expect(result.skipped[3].reason).toContain('Role must be APPLICANT or COMPANY');
  });

  it('rejects rows with bad numbers instead of failing the whole file', async () => {
    const { service } = build();
    const result = await service.importUsers('admin-1', [
      { email: 'a@college.edu', role: 'APPLICANT', cgpa: 'abc' },
      { email: 'b@college.edu', role: 'APPLICANT', passingYear: '2026.5' },
      company,
    ]);
    expect(result.created).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('CGPA must be a number');
    expect(result.skipped[1].reason).toContain('Passing year must be a whole number');
  });

  it('queues one invite job per created user and stores a 7-day token', async () => {
    const { service, mail, redis } = build();
    const result = await service.importUsers('admin-1', [student, company]);

    expect(mail.enqueueInvite).toHaveBeenCalledTimes(2);
    const [email, token] = mail.enqueueInvite.mock.calls[0];
    expect(email).toBe('stud@college.edu');
    expect(token).toEqual(expect.any(String));
    expect(redis.client.set).toHaveBeenCalledWith(`reset:${token}`, result.created[0].id, 'EX', INVITE_TOKEN_TTL_SECONDS);
    expect(INVITE_TOKEN_TTL_SECONDS).toBe(604800);
  });

  it('sends academic data and academicVerified=true for applicants', async () => {
    const { service, userService } = build();
    await service.importUsers('admin-1', [student]);
    expect(userService.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'APPLICANT',
        name: 'Stud',
        companyStatus: 'approved',
        academic: { cgpa: 8.2, branch: 'CSE', passingYear: 2026, backlogs: 0 },
        academicVerified: true,
      }),
    );
  });

  it('does not lock academic fields when the row has no academic values (blank CSV cells)', async () => {
    const { service, userService } = build();
    await service.importUsers('admin-1', [{ email: 'a@college.edu', role: 'APPLICANT', cgpa: '', branch: '', passingYear: '' }]);
    const payload = userService.createProfile.mock.calls[0][0];
    expect(payload.academic).toBeUndefined();
    expect(payload.academicVerified).toBeUndefined();
  });

  it('sends no academic data for companies and marks them approved', async () => {
    const { service, userService } = build();
    await service.importUsers('admin-1', [{ ...company, cgpa: '9' }]);
    const payload = userService.createProfile.mock.calls[0][0];
    expect(payload.companyStatus).toBe('approved');
    expect(payload.academic).toBeUndefined();
  });

  it('undoes the account and skips the row when profile creation fails', async () => {
    const { service, prisma, mail } = build({ createProfile: vi.fn().mockRejectedValue(new Error('down')) });
    const result = await service.importUsers('admin-1', [company]);

    expect(result.created).toHaveLength(0);
    expect(result.skipped[0].reason).toContain('Could not create the profile');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'id-hr@acme.com' } });
    expect(mail.enqueueInvite).not.toHaveBeenCalled();
  });

  it('skips a row that loses a unique-email race', async () => {
    const { service, prisma } = build();
    prisma.user.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const result = await service.importUsers('admin-1', [company]);
    expect(result.skipped[0].reason).toBe('Email already registered');
  });

  it('still reports the user as created when the invite cannot be queued', async () => {
    const { service, mail } = build();
    mail.enqueueInvite.mockRejectedValueOnce(new Error('redis down'));
    const result = await service.importUsers('admin-1', [company]);
    expect(result.created).toHaveLength(1);
  });

  it('writes one audit entry with the counts', async () => {
    const { service, userService } = build();
    await service.importUsers('admin-1', [company, { email: 'bad', role: 'COMPANY' }]);
    expect(userService.audit).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'users.imported',
      target: 'users:import',
      meta: { created: 1, skipped: 1 },
    });
  });
});