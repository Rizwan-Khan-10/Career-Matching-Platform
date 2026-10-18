import { LoggerService } from '@nestjs/common';
import { currentRequestId } from './request-context';

const SERVICE = 'auth-service';
const ORDER = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof ORDER;

const threshold = (): number => {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return raw in ORDER ? ORDER[raw as Level] : ORDER.info;
};

const text = (m: unknown): string => {
  if (typeof m === 'string') return m;
  if (m instanceof Error) return m.message;
  try {
    return JSON.stringify(m);
  } catch {
    return String(m);
  }
};

/**
 * Nest's Logger wrapped to print one JSON line per message: ts, level, service, requestId, msg (contract section 3,
 * rule 8). No PII belongs in `msg`: log ids and counts, never e-mails, passwords or tokens.
 */
export class JsonLogger implements LoggerService {
  private write(level: Level, message: unknown, context?: string, stack?: string) {
    if (ORDER[level] > threshold()) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      requestId: currentRequestId() ?? null,
      msg: text(message),
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
    };
    (level === 'error' ? process.stderr : process.stdout).write(JSON.stringify(line) + '\n');
  }

  log(message: unknown, ...rest: unknown[]) {
    this.write('info', message, this.ctx(rest));
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write('warn', message, this.ctx(rest));
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write('debug', message, this.ctx(rest));
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write('debug', message, this.ctx(rest));
  }
  // Nest calls error(message, stack?, context?)
  error(message: unknown, ...rest: unknown[]) {
    const strings = rest.filter((x): x is string => typeof x === 'string');
    this.write(
      'error',
      message,
      strings.length > 1 ? strings[strings.length - 1] : undefined,
      strings.length > 1 ? strings[0] : undefined,
    );
  }

  private ctx(rest: unknown[]): string | undefined {
    const last = rest[rest.length - 1];
    return typeof last === 'string' ? last : undefined;
  }
}