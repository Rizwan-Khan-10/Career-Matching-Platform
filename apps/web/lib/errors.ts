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