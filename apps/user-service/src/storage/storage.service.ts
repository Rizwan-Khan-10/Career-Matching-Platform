/// <reference types="multer" />
import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class StorageService {
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
                    public_id: 'avatar',
                    overwrite: true,
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
}