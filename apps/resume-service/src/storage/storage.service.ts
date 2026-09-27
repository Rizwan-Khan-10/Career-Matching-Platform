/// <reference types="multer" />

import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    async uploadResume(applicantId: string, file: Express.Multer.File): Promise<{ publicId: string; fileUrl: string }> {
        const extension = file.originalname.includes('.')
            ? file.originalname.split('.').pop()!
            : 'pdf';
        const publicId = `resumes/${applicantId}/${Date.now()}-${file.originalname}`;

        await new Promise<void>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'raw',
                    type: 'private', // not publicly delivered — avoids Cloudinary's PDF/ZIP public-delivery block, and keeps resumes non-guessable
                    public_id: publicId,
                },
                (error) => {
                    if (error) return reject(error);
                    resolve();
                },
            );
            Readable.from(file.buffer).pipe(uploadStream);
        });

        const fileUrl = this.getSignedUrl(publicId, extension);
        return { publicId, fileUrl };
    }

    // Generates a fresh, time-limited signed download link for an already
    // uploaded resume. Call this again whenever a valid link is needed later
    // (the one returned at upload time expires after 15 minutes).
    getSignedUrl(publicId: string, format: string, expiresInSeconds = 15 * 60): string {
        const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
        return cloudinary.utils.private_download_url(publicId, format, {
            resource_type: 'raw',
            type: 'private',
            expires_at: expiresAt,
        });
    }
}