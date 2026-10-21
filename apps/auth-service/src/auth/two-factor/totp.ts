import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(input: string): Buffer {
    const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx < 0) throw new Error('Invalid base32 secret');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

/** 160-bit random secret, base32 (what authenticator apps expect). */
export function generateTotpSecret(): string {
    return base32Encode(randomBytes(20));
}

export function currentStep(nowMs: number = Date.now()): number {
    return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

function hotp(secret: Buffer, counter: number): string {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const hash = createHmac('sha1', secret).update(msg).digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
        ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
    return String(binary % 1_000_000).padStart(6, '0');
}

export function totpForStep(secretBase32: string, step: number): string {
    return hotp(base32Decode(secretBase32), step);
}

/** Returns the time step that matched (so the caller can refuse a replay), or null. Accepts +-`window` steps. */
export function verifyTotp(secretBase32: string, code: string, nowMs: number = Date.now(), window = 1): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const secret = base32Decode(secretBase32);
    const now = currentStep(nowMs);
    const given = Buffer.from(code);
    let matched: number | null = null;
    // no early exit: every step is compared, so timing does not show which step was close
    for (let step = now - window; step <= now + window; step++) {
        const expected = Buffer.from(hotp(secret, step));
        if (timingSafeEqual(expected, given) && matched === null) matched = step;
    }
    return matched;
}

export function buildOtpauthUrl(secretBase32: string, accountEmail: string, issuer: string): string {
    const label = encodeURIComponent(`${issuer}:${accountEmail}`);
    const params = new URLSearchParams({
        secret: secretBase32,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: String(TOTP_STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}