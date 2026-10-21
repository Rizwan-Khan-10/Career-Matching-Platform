import { createHmac } from 'node:crypto';
import { sleep } from './poll';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const stepNow = () => Math.floor(Date.now() / 1000 / 30);

export function totpForStep(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const bin = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** The server accepts a time step only once, so after using step N this waits for a later 30 s step. */
export async function codeAfter(secret: string, usedStep: number): Promise<string> {
  while (stepNow() <= usedStep) await sleep(1000);
  return totpForStep(secret, stepNow());
}