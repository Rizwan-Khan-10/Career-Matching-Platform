import { isAxiosError } from 'axios';

/** Nest errors are { statusCode, message, error }; validation errors give message as an array. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length > 0) return message.join(', ');
  }
  return fallback;
}

export function isForbidden(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 403;
}

export function isConflict(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 409;
}

/** Some Nest errors carry a machine-readable { code } next to the message (ROLE_REQUIRED, GOOGLE_LINK_BLOCKED). */
export function getErrorCode(err: unknown): string | undefined {
  if (isAxiosError(err)) {
    const code = err.response?.data?.code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}