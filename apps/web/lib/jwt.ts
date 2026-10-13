export interface JwtPayload { sub: string; role: string; exp?: number }

/** JWT payloads are base64URL ("-" and "_", no padding). Plain atob() throws on those characters, which broke login at random. */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = atob(b64);
    const json = decodeURIComponent(bytes.split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}