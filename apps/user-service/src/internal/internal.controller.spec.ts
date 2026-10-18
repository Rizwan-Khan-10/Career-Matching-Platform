import { BadRequestException, ConflictException } from '@nestjs/common';
import { InternalController } from './internal.controller';

function build(existing: unknown = null) {
  const prisma = {
    applicantProfile: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data })),
    },
    companyProfile: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'c1', ...data })),
    },
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  return { controller: new InternalController(prisma as any, events as any), prisma, events };
}

const applicant = { userId: 'u1', role: 'APPLICANT', email: 'a@college.edu' };
const company = { userId: 'c1', role: 'COMPANY', email: 'hr@acme.com' };

describe('InternalController.createProfile', () => {
  it('stores imported academic data as verified and publishes profile.updated', async () => {
    const { controller, prisma, events } = build();
    await controller.createProfile({
      ...applicant, name: 'Asha', academicVerified: true,
      academic: { cgpa: 8.1, branch: 'CSE', passingYear: 2026, backlogs: 0 },
    });

    expect(prisma.applicantProfile.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1', name: 'Asha', cgpa: 8.1, branch: 'CSE', passingYear: 2026, backlogs: 0, academicVerified: true,
      },
    });
    expect(events.publish).toHaveBeenCalledWith('profile.updated', { applicantId: 'u1' });
  });

  it('creates a plain signup applicant as unverified and publishes nothing', async () => {
    const { controller, prisma, events } = build();
    await controller.createProfile(applicant);

    expect(prisma.applicantProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', name: null, academicVerified: false }),
    });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('keeps a company pending when auth-service says so', async () => {
    const { controller, prisma } = build();
    await controller.createProfile({ ...company, companyStatus: 'pending' });
    expect(prisma.companyProfile.create).toHaveBeenCalledWith({
      data: { userId: 'c1', name: null, status: 'pending' },
    });
  });

  it('defaults a company to approved and uses the given name', async () => {
    const { controller, prisma } = build();
    await controller.createProfile({ ...company, name: 'Acme' });
    expect(prisma.companyProfile.create).toHaveBeenCalledWith({
      data: { userId: 'c1', name: 'Acme', status: 'approved' },
    });
  });

  it('ignores academic data sent for a company', async () => {
    const { controller, events } = build();
    await controller.createProfile({ ...company, academic: { cgpa: 9 } });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('answers 409 when the profile already exists', async () => {
    const { controller, prisma } = build({ id: 'x' });
    await expect(controller.createProfile(applicant)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.applicantProfile.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown role', async () => {
    const { controller } = build();
    await expect(controller.createProfile({ ...applicant, role: 'ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
  });
});