const mockDestroy = jest.fn();
jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: { destroy: (...args: unknown[]) => mockDestroy(...args) },
        utils: {},
    },
}));

import { StorageService } from './storage.service';

describe('StorageService (Cloudinary mocked)', () => {
    let storage: StorageService;

    beforeEach(() => {
        mockDestroy.mockReset();
        storage = new StorageService();
    });

    it('deletes private raw files with invalidate: true', async () => {
        mockDestroy.mockResolvedValue({ result: 'ok' });
        await expect(storage.destroy('resumes/a/cv.pdf')).resolves.toBe(true);
        expect(mockDestroy).toHaveBeenCalledWith('resumes/a/cv.pdf', { resource_type: 'raw', type: 'private', invalidate: true });
    });

    it('treats "not found" as already gone', async () => {
        mockDestroy.mockResolvedValue({ result: 'not found' });
        await expect(storage.destroy('x')).resolves.toBe(true);
    });

    it('returns false when Cloudinary errors or answers with something else', async () => {
        mockDestroy.mockRejectedValueOnce(new Error('network'));
        await expect(storage.destroy('x')).resolves.toBe(false);
        mockDestroy.mockResolvedValueOnce({ result: 'error' });
        await expect(storage.destroy('x')).resolves.toBe(false);
    });

    it('deletes the original and the generated PDF', async () => {
        mockDestroy.mockResolvedValue({ result: 'ok' });
        await expect(storage.destroyResumeFiles('resumes/a/cv.docx', 'resumes/a/pdf/r1.pdf')).resolves.toBe(true);
        expect(mockDestroy.mock.calls.map((c) => c[0])).toEqual(['resumes/a/cv.docx', 'resumes/a/pdf/r1.pdf']);
    });

    it('deletes only the original when there is no PDF yet', async () => {
        mockDestroy.mockResolvedValue({ result: 'ok' });
        await storage.destroyResumeFiles('resumes/a/cv.docx', null);
        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('deletes the file once when the original already is the PDF (same public id)', async () => {
        mockDestroy.mockResolvedValue({ result: 'ok' });
        await storage.destroyResumeFiles('resumes/a/cv.pdf', 'resumes/a/cv.pdf');
        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('is false when either file could not be deleted, but still tries both', async () => {
        mockDestroy.mockResolvedValueOnce({ result: 'ok' }).mockRejectedValueOnce(new Error('boom'));
        await expect(storage.destroyResumeFiles('a', 'b')).resolves.toBe(false);
        expect(mockDestroy).toHaveBeenCalledTimes(2);
    });
});