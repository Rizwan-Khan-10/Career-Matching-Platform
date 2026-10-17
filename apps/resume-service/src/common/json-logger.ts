import type { LoggerService } from '@nestjs/common';
import { getRequestId } from './request-context';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Nest Logger -> one JSON line per message: { ts, level, service, requestId, msg } (contract 3.8).
 * Never pass resume text, e-mails or tokens as the message.
 */
export class JsonLogger implements LoggerService {
    constructor(
        private readonly service = 'resume-service',
        private readonly minLevel: Level = JsonLogger.levelFromEnv(),
    ) { }

    static levelFromEnv(): Level {
        const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
        return raw === 'debug' || raw === 'warn' || raw === 'error' ? raw : 'info';
    }

    log(message: unknown, ...rest: unknown[]) { this.write('info', message, rest); }
    error(message: unknown, ...rest: unknown[]) { this.write('error', message, rest); }
    warn(message: unknown, ...rest: unknown[]) { this.write('warn', message, rest); }
    debug(message: unknown, ...rest: unknown[]) { this.write('debug', message, rest); }
    verbose(message: unknown, ...rest: unknown[]) { this.write('debug', message, rest); }
    fatal(message: unknown, ...rest: unknown[]) { this.write('error', message, rest); }

    private write(level: Level, message: unknown, rest: unknown[]) {
        if (ORDER[level] < ORDER[this.minLevel]) return;
        // Nest passes the context name (class) as the last string argument, and a stack as the one before it for errors
        const strings = rest.filter((r): r is string => typeof r === 'string');
        const context = strings.length ? strings[strings.length - 1] : undefined;
        const stack = level === 'error' && strings.length > 1 ? strings[0] : undefined;
        const line: Record<string, unknown> = {
            ts: new Date().toISOString(),
            level,
            service: this.service,
            requestId: getRequestId() ?? null,
            msg: message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message),
        };
        if (context) line.context = context;
        if (stack) line.stack = stack;
        process.stdout.write(JSON.stringify(line) + '\n');
    }
}