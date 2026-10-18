import { Writable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import { StorageService, publicIdFromUrl } from './storage.service';

jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: { destroy: jest.fn(), upload_stream: jest.fn() },
    },
}));

const destroy = cloudinary.uploader.destroy as jest.Mock;
const uploadStream = cloudinary.uploader.upload_stream as jest.Mock;
const url = (path: string) => `https://res.cloudinary.com/demo/image/upload/v1712345678/${path}`;

beforeEach(() => jest.clearAllMocks());

describe('publicIdFromUrl', () => {
    it('extracts the public id without version and extension', () => {
        expect(publicIdFromUrl(url('avatars/u1/avatar.png'))).toBe('avatars/u1/avatar');
        expect(publicIdFromUrl(url('avatars/u1/avatar-ab12cd.webp?x=1'))).toBe('avatars/u1/avatar-ab12cd');
    });

    it('returns null for empty or foreign URLs', () => {
        expect(publicIdFromUrl(null)).toBeNull();
        expect(publicIdFromUrl('')).toBeNull();
        expect(publicIdFromUrl('https://example.com/me.png')).toBeNull();
    });
});

describe('StorageService.deleteAvatarByUrl', () => {
    const storage = new StorageService();

    it('deletes the old avatar (the legacy fixed name and the new unique names)', async () => {
        await storage.deleteAvatarByUrl(url('avatars/u1/avatar.png'), 'u1');
        await storage.deleteAvatarByUrl(url('avatars/u1/avatar-ab12cd34ef56.jpg'), 'u1');

        expect(destroy).toHaveBeenNthCalledWith(1, 'avatars/u1/avatar', { resource_type: 'image', invalidate: true });
        expect(destroy).toHaveBeenNthCalledWith(2, 'avatars/u1/avatar-ab12cd34ef56', { resource_type: 'image', invalidate: true });
    });

    it("never deletes outside this user's own folder", async () => {
        await storage.deleteAvatarByUrl(url('avatars/u2/avatar.png'), 'u1'); // someone else's file
        await storage.deleteAvatarByUrl(url('other/logo.png'), 'u1'); // not an avatar
        await storage.deleteAvatarByUrl(url('avatars/u10/avatar.png'), 'u1'); // look-alike folder
        expect(destroy).not.toHaveBeenCalled();
    });

    it('does nothing when there was no previous avatar', async () => {
        await storage.deleteAvatarByUrl(null, 'u1');
        await storage.deleteAvatarByUrl(undefined, 'u1');
        expect(destroy).not.toHaveBeenCalled();
    });

    it('does not throw when Cloudinary fails', async () => {
        destroy.mockRejectedValueOnce(new Error('cloudinary down'));
        await expect(storage.deleteAvatarByUrl(url('avatars/u1/avatar.png'), 'u1')).resolves.toBeUndefined();
    });
});

describe('StorageService.uploadAvatar', () => {
    it('uploads under a new unique name per upload and does not overwrite', async () => {
        uploadStream.mockImplementation((_options: unknown, callback: (e: unknown, r: unknown) => void) =>
            new Writable({
                write(_chunk, _enc, done) { done(); },
                final(done) { callback(undefined, { secure_url: url('avatars/u1/avatar-aaa.png') }); done(); },
            }));

        const storage = new StorageService();
        const file = { mimetype: 'image/png', size: 10, buffer: Buffer.from('x') } as Express.Multer.File;
        await storage.uploadAvatar('u1', file);
        await storage.uploadAvatar('u1', file);

        const [first] = uploadStream.mock.calls[0];
        const [second] = uploadStream.mock.calls[1];
        expect(first.folder).toBe('avatars/u1');
        expect(first.public_id).toMatch(/^avatar-[0-9a-f]{12}$/);
        expect(first.overwrite).toBeUndefined();
        expect(second.public_id).not.toBe(first.public_id);
    });
});