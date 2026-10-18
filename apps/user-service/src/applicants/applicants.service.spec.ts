import { ApplicantsService } from './applicants.service';

const baseProfile = {
  id: 'p1', userId: 'u1', name: 'Asha', phone: null, education: null, avatarUrl: null, headline: null,
  location: null, linkedinUrl: null, cgpa: null, branch: null, passingYear: null, backlogs: null,
  academicVerified: false,
};

function build(profile: Record<string, unknown> = baseProfile) {
  const prisma = {
    applicantProfile: {
      upsert: jest.fn().mockResolvedValue(profile),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...profile, ...data })),
    },
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const service = new ApplicantsService(prisma as any, {} as any, events as any);
  return { service, prisma, events };
}

describe('ApplicantsService', () => {
  describe('getByUserId (lazy create)', () => {
    it('creates the profile row when it is missing instead of returning 404', async () => {
      const { service, prisma } = build();
      await expect(service.getByUserId('u1')).resolves.toMatchObject({ userId: 'u1' });
      expect(prisma.applicantProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        update: {},
        create: { userId: 'u1', name: '' },
      });
    });
  });

  describe('update', () => {
    it('saves academic fields and publishes profile.updated when one changed', async () => {
      const { service, prisma, events } = build();
      await service.update('u1', { cgpa: 8.2, branch: 'CSE' });

      expect(prisma.applicantProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { cgpa: 8.2, branch: 'CSE', passingYear: undefined, backlogs: undefined },
      });
      expect(events.publish).toHaveBeenCalledWith('profile.updated', { applicantId: 'u1' });
    });

    it('ignores academic fields when the profile is verified, but still saves the other fields', async () => {
      const { service, prisma, events } = build({ ...baseProfile, academicVerified: true, cgpa: 9, branch: 'IT' });
      await service.update('u1', { cgpa: 5, branch: 'ME', passingYear: 2020, backlogs: 3, headline: 'Dev' });

      expect(prisma.applicantProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { headline: 'Dev' },
      });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not publish when the academic values are unchanged', async () => {
      const { service, events } = build({ ...baseProfile, cgpa: 8.2, branch: 'CSE' });
      await service.update('u1', { cgpa: 8.2, branch: 'CSE' });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not publish when only non-academic fields change', async () => {
      const { service, events } = build();
      await service.update('u1', { headline: 'Backend developer', phone: '12345' });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('publishes when an academic value is cleared with null', async () => {
      const { service, events } = build({ ...baseProfile, backlogs: 2 });
      await service.update('u1', { backlogs: null });
      expect(events.publish).toHaveBeenCalledWith('profile.updated', { applicantId: 'u1' });
    });

    it('does not publish when null clears a value that was already empty', async () => {
      const { service, events } = build();
      await service.update('u1', { cgpa: null });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('creates the profile first so PATCH never fails on a missing row', async () => {
      const { service, prisma } = build();
      await service.update('u1', { name: 'Asha' });
      expect(prisma.applicantProfile.upsert).toHaveBeenCalledTimes(1);
    });
  });
});