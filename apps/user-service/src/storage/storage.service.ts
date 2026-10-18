/// <reference types="multer" />
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** ".../image/upload/v123/avatars/u1/avatar-ab12.png" -> "avatars/u1/avatar-ab12" */
export function publicIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[A-Za-z0-9]+)?(?:\?.*)?$/);
    if (!match) return null;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return null;
    }
}

@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);

    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
        if (!ACCEPTED_TYPES.includes(file.mimetype)) {
            throw new BadRequestException('Only JPEG, PNG or WEBP images are allowed');
        }
        if (file.size > MAX_SIZE_BYTES) {
            throw new BadRequestException('Image must be under 5MB');
        }

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'image',
                    folder: `avatars/${userId}`,
                    // A new name per upload: the old file is then a separate asset that deleteAvatarByUrl removes
                    // (with a fixed name + overwrite the old URL would linger in the CDN cache).
                    public_id: `avatar-${randomBytes(6).toString('hex')}`,
                    // Keep it small and consistently cropped for a profile photo.
                    transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
                },
                (error, result) => {
                    if (error || !result) return reject(error);
                    resolve(result.secure_url);
                },
            );
            Readable.from(file.buffer).pipe(uploadStream);
        });
    }

    /**
     * Deletes a previous avatar by its URL. Only files inside this user's own `avatars/<userId>/` folder are
     * touched, so a strange URL in the database can never delete someone else's asset. Never throws: a failed
     * clean-up must not fail the upload that already succeeded.
     */
    async deleteAvatarByUrl(url: string | null | undefined, userId: string): Promise<void> {
        const publicId = publicIdFromUrl(url);
        if (!publicId || !publicId.startsWith(`avatars/${userId}/`)) return;

        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
        } catch (err) {
            this.logger.warn(`could not delete old avatar ${publicId}: ${(err as Error).message}`);
        }
    }
}