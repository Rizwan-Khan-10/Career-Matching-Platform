import { ApplicantsService } from '../applicants/applicants.service';
import { CompaniesService } from '../companies/companies.service';

const OLD_URL = 'https://res.cloudinary.com/demo/image/upload/v1/avatars/u1/avatar.png';
const NEW_URL = 'https://res.cloudinary.com/demo/image/upload/v2/avatars/u1/avatar-ab12cd34ef56.png';
const file = { mimetype: 'image/png', size: 10, buffer: Buffer.from('x') } as Express.Multer.File;

function setup(kind: 'applicantProfile' | 'companyProfile', uploadFails = false) {
    const profile = { userId: 'u1', avatarUrl: OLD_URL };
    const prisma = {
        [kind]: {
            upsert: jest.fn().mockResolvedValue(profile),
            update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...profile, ...data })),
        },
    };
    const storage = {
        uploadAvatar: uploadFails ? jest.fn().mockRejectedValue(new Error('upload failed')) : jest.fn().mockResolvedValue(NEW_URL),
        deleteAvatarByUrl: jest.fn().mockResolvedValue(undefined),
    };
    const service = kind === 'applicantProfile'
        ? new ApplicantsService(prisma as any, storage as any, { publish: jest.fn() } as any)
        : new CompaniesService(prisma as any, storage as any);
    return { service, prisma: prisma[kind], storage };
}

describe.each(['applicantProfile', 'companyProfile'] as const)('avatar replace (%s)', (kind) => {
    it('deletes the old Cloudinary file after the new avatar is saved', async () => {
        const { service, prisma, storage } = setup(kind);
        const result = await service.updateAvatar('u1', file);

        expect(prisma.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { avatarUrl: NEW_URL } });
        expect(storage.deleteAvatarByUrl).toHaveBeenCalledWith(OLD_URL, 'u1');
        expect(prisma.update.mock.invocationCallOrder[0]).toBeLessThan(storage.deleteAvatarByUrl.mock.invocationCallOrder[0]);
        expect(result).toMatchObject({ avatarUrl: NEW_URL });
    });

    it('keeps the old file when the upload fails', async () => {
        const { service, prisma, storage } = setup(kind, true);
        await expect(service.updateAvatar('u1', file)).rejects.toThrow('upload failed');
        expect(prisma.update).not.toHaveBeenCalled();
        expect(storage.deleteAvatarByUrl).not.toHaveBeenCalled();
    });
});