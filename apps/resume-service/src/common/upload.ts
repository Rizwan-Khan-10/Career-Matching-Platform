/// <reference types="multer" />
import { BadRequestException } from '@nestjs/common';

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
// what the parsers can actually read (legacy .doc is NOT supported by resume-parser-agent / jd-extractor-agent)
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'];
/** pass to FileInterceptor('file', uploadOptions): multer stops reading at the limit instead of buffering unlimited data */
export const uploadOptions = { limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 } };

export function extensionOf(name: string): string {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
}

export function validateUpload(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('No file uploaded (the form field must be named "file")');
    if (!file.size) throw new BadRequestException('The file is empty');
    const ext = extensionOf(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw new BadRequestException(`Unsupported file type ".${ext || '?'}". Upload one of: ${ALLOWED_EXTENSIONS.join(', ')} (old .doc is not supported, save it as .docx or PDF).`);
    }
}

/** User file names go into a Cloudinary public_id: no "/" (extra folders), no ? & # % < > \ and no unicode surprises. */
export function safeFileName(originalName: string): string {
    const ext = extensionOf(originalName);
    const base = (originalName || 'file')
        .replace(/\.[^.]*$/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // drop accents: é -> e (not e_)
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 60) || 'file';
    return ext ? `${base}.${ext}` : base;
}