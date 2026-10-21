import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export function isEncryptionConfigured(keyHex: string | undefined = process.env.TWO_FACTOR_ENCRYPTION_KEY): boolean {
    return !!keyHex && KEY_PATTERN.test(keyHex);
}

function getKey(keyHex: string | undefined = process.env.TWO_FACTOR_ENCRYPTION_KEY): Buffer {
    if (!keyHex || !KEY_PATTERN.test(keyHex)) {
        throw new Error('TWO_FACTOR_ENCRYPTION_KEY must be 64 hex characters (openssl rand -hex 32)');
    }
    return Buffer.from(keyHex, 'hex');
}

/** AES-256-GCM. Stored as "v1.<iv>.<tag>.<ciphertext>" (base64 parts). A new random iv every time. */
export function encryptSecret(plain: string, keyHex?: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(keyHex), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

/** Throws when the key is wrong or the value was changed (GCM checks both). */
export function decryptSecret(stored: string, keyHex?: string): string {
    const [version, iv, tag, data] = stored.split('.');
    if (version !== VERSION || !iv || !tag || !data) throw new Error('Unknown secret format');
    const decipher = createDecipheriv('aes-256-gcm', getKey(keyHex), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}