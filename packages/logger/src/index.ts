export const LOGGER_VERSION = '0.1.0';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'auth',
  'patrimonio',
  'saldo',
  'balance',
  'cpf',
  'cnpj',
  'credit_card',
  'apikey',
  'api_key',
]);

export function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;

  const sanitized: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeContext(value as LogContext);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export interface LoggerOptions {
  service?: string;
  minLevel?: LogLevel;
}

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private service: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.service = options.service ?? 'atlas';
    this.minLevel = options.minLevel ?? 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.minLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const sanitized = sanitizeContext(context);
    const payload = {
      timestamp,
      level,
      service: this.service,
      message,
      ...(sanitized ? { context: sanitized } : {}),
    };
    return JSON.stringify(payload);
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
  }
}

export const logger = new Logger();
