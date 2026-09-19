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

    async uploadJobDoc(companyId: string, file: Express.Multer.File): Promise<string> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'raw',
                    folder: `job-docs/${companyId}`,
                    public_id: `${Date.now()}-${file.originalname}`,
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