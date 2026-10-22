/**
 * Resume / requirement-doc upload rules. MUST match what the backend accepts:
 * apps/resume-service/src/common/upload.ts and apps/job-service/src/common/upload.ts
 * (the parser agents can read exactly these; legacy .doc is NOT supported).
 *
 * We check the file EXTENSION, not file.type: browsers often report an empty or odd MIME type
 * for .docx / .tiff / .bmp (especially on Windows), which would wrongly reject valid files.
 */
export const UPLOAD_MAX_MB = 10;
export const UPLOAD_EXTENSIONS = ['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'] as const;

/** value for <input accept="...">, e.g. ".pdf,.docx,.txt,..." */
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');

/** short text for hints, e.g. "PDF, DOCX, TXT or an image (JPG, PNG, ...)" */
export const UPLOAD_FORMATS_HINT = 'PDF, DOCX, TXT or an image (JPG, PNG, WEBP, BMP, TIFF)';

export function fileExtension(name: string): string {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
}

/** -> an error message to show the user, or null when the file is fine. */
export function validateUploadFile(file: { name: string; size: number }, maxMb: number = UPLOAD_MAX_MB): string | null {
    const ext = fileExtension(file.name);
    if (ext === 'doc') return 'Old .doc files are not supported. Save it as .docx or PDF and try again.';
    if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return `Unsupported file. Upload ${UPLOAD_FORMATS_HINT}.`;
    if (file.size === 0) return 'The file is empty.';
    if (file.size > maxMb * 1024 * 1024) return `Keep the file under ${maxMb}MB.`;
    return null;
}
