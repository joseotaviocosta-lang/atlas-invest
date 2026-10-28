export const LOGGER_VERSION = '0.2.0';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  // Passwords & Secrets
  'password',
  'passwd',
  'newpassword',
  'new_password',
  'passwordhash',
  'password_hash',
  'token',
  'rawtoken',
  'raw_token',
  'secret',
  'authorization',
  'cookie',
  'auth',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'refreshtokenhash',
  'refresh_token_hash',
  'resettoken',
  'reset_token',
  'tokenhash',
  'token_hash',
  'jwt',
  'bearer',
  'bearertoken',
  'bearer_token',
  'apikey',
  'api_key',
  'client_secret',
  'clientsecret',

  // Sensitive PII
  'cpf',
  'cnpj',
  'credit_card',
  'creditcard',
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',

  // Financial Balances & Totals (Zero raw floats or financial amounts in logs)
  'patrimonio',
  'patrimonio_total',
  'patrimoniototal',
  'saldo',
  'balance',
  'portfolio_balance',
  'total_balance',
  'total_cost',
  'totalcost',
  'average_cost',
  'averagecost',
  'realized_gain',
  'realizedgain',
  'unrealized_gain',
  'unrealizedgain',
  'rendimento',

  // AI Prompts, Grounding Facts & Private Context (Zero PII or private context leakage)
  'prompt',
  'prompts',
  'systemprompt',
  'system_prompt',
  'ai_context',
  'aicontext',
  'groundingcontext',
  'grounding_context',
  'grounding_facts',
  'groundingfacts',
  'private_context',
  'privatecontext',
  'explanation_context',
  'explanationcontext',
  'user_query',
  'userquery',

  // Raw payloads & File import content
  'filecontent',
  'file_content',
  'file_data',
  'filedata',
  'content_base64',
  'contentbase64',
  'rawpayload',
  'raw_payload',
  'importpayload',
  'import_payload',
  'financialpayload',
  'financial_payload',

  // Database Connection Strings
  'database_url',
  'databaseurl',
  'db_url',
  'dburl',
  'connection_string',
  'connectionstring',
  'datasource_url',
  'datasourceurl',
]);

const CONNECTION_STRING_REGEX = /(postgres|postgresql|mysql|mongodb):\/\/[^:]+:[^@]+@[^\s"']+/gi;

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (CONNECTION_STRING_REGEX.test(value)) {
      return value.replace(CONNECTION_STRING_REGEX, '[REDACTED]');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string' && CONNECTION_STRING_REGEX.test(item)) {
        return item.replace(CONNECTION_STRING_REGEX, '[REDACTED]');
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return sanitizeContext(item as LogContext);
      }
      return item;
    });
  }
  if (value instanceof Error) {
    const safeMsg = value.message.replace(CONNECTION_STRING_REGEX, '[REDACTED]');
    const safeStack = value.stack
      ? value.stack.replace(CONNECTION_STRING_REGEX, '[REDACTED]')
      : undefined;
    const errorObj: Record<string, unknown> = {
      name: value.name,
      message: safeMsg,
      stack: safeStack,
    };
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_KEYS.has(lower)) {
        errorObj[k] = '[REDACTED]';
      } else {
        errorObj[k] = sanitizeValue(v);
      }
    }
    return errorObj;
  }
  if (typeof value === 'object') {
    return sanitizeContext(value as LogContext);
  }
  return value;
}

export function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;

  const sanitized: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeValue(value);
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
    const safeMessage = message.replace(CONNECTION_STRING_REGEX, '[REDACTED]');
    const sanitized = sanitizeContext(context);
    const payload = {
      timestamp,
      level,
      service: this.service,
      message: safeMessage,
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

// ============================================================================
// IN-MEMORY VENDOR-NEUTRAL TELEMETRY COLLECTOR
// Zero database tables, zero vendor lock-in, safe bounded ring buffers
// ============================================================================

export type ProviderStatus = 'ok' | 'error' | 'timeout' | 'degraded';
export type JobStatus = 'completed' | 'failed';
export type RetryOutcome = 'success' | 'exhausted';
export type NotificationSourceStatus = 'ok' | 'error' | 'degraded';

interface InternalProviderStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  latencies: number[];
  lastStatus: ProviderStatus;
  degraded: boolean;
  lastErrorClass?: string;
}

interface InternalJobStats {
  total: number;
  completed: number;
  failed: number;
  latencies: number[];
}

interface InternalRetryStats {
  totalAttempts: number;
  successCount: number;
  exhaustedCount: number;
}

interface InternalNotificationSourceStats {
  status: NotificationSourceStatus;
  lastCheckedAt: string;
  errorClass?: string;
}

const MAX_LATENCY_SAMPLES = 500;
const MAX_UNIQUE_ROUTES = 100;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_HASH_REGEX = /\/[0-9a-f]{32,64}(\/|$)/gi;
const PARAM_SEGMENT_REGEX = /\/(assets|positions|quote|quotes|items)\/[A-Za-z0-9_.-]{2,16}(\/|$)/gi;
const NUMERIC_ID_REGEX = /\/\d+(\/|$)/g;

function normalizeRoute(route: string): string {
  if (!route) return '/';
  // Strip query string
  const cleanRoute = route.split('?')[0] ?? '/';
  // Replace UUIDs with :id
  let normalized = cleanRoute.replace(UUID_REGEX, ':id');
  // Replace hex tokens/hashes with :id
  normalized = normalized.replace(HEX_HASH_REGEX, '/:id$1');
  // Replace asset/position/quote slugs with :id
  normalized = normalized.replace(PARAM_SEGMENT_REGEX, '/$1/:id$2');
  // Replace trailing/inline numeric segments with :id
  normalized = normalized.replace(NUMERIC_ID_REGEX, '/:id$1');
  return normalized;
}

function sanitizeErrorClass(errorClass?: string): string | undefined {
  if (!errorClass) return undefined;
  const sanitized = errorClass.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
  return sanitized.length > 0 ? sanitized : 'OperationalError';
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[safeIndex] ?? 0;
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export interface TelemetrySnapshot {
  uptimeSeconds: number;
  timestamp: string;
  requests: {
    total: number;
    statusBuckets: {
      '2xx': number;
      '3xx': number;
      '4xx': number;
      '5xx': number;
    };
    avgDurationMs: number;
    p95DurationMs: number;
    errorRate: number;
    routes: Record<string, number>;
  };
  database: {
    totalQueries: number;
    successCount: number;
    failureCount: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
  providers: Record<
    string,
    {
      totalCalls: number;
      successRate: number;
      avgDurationMs: number;
      lastStatus: ProviderStatus;
      degraded: boolean;
      lastErrorClass?: string;
    }
  >;
  jobs: Record<
    string,
    {
      total: number;
      completed: number;
      failed: number;
      avgDurationMs: number;
    }
  >;
  retries: Record<
    string,
    {
      totalAttempts: number;
      successCount: number;
      exhaustedCount: number;
    }
  >;
  notificationSources: Record<
    string,
    {
      status: NotificationSourceStatus;
      lastCheckedAt: string;
      errorClass?: string;
    }
  >;
}

export class TelemetryCollector {
  private startTime = Date.now();

  // Requests
  private requestCount = 0;
  private statusBuckets = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };
  private requestLatencies: number[] = [];
  private routeCounts: Record<string, number> = {};

  // Database
  private dbQueries = 0;
  private dbSuccesses = 0;
  private dbFailures = 0;
  private dbLatencies: number[] = [];

  // External Providers
  private providerStats: Map<string, InternalProviderStats> = new Map();

  // Jobs
  private jobStats: Map<string, InternalJobStats> = new Map();

  // Retries
  private retryStats: Map<string, InternalRetryStats> = new Map();

  // Notification Sources
  private notificationSourceStats: Map<string, InternalNotificationSourceStats> = new Map();

  recordRequest(method: string, rawRoute: string, statusCode: number, durationMs: number): void {
    try {
      this.requestCount++;
      const safeMethod = typeof method === 'string' ? method.toUpperCase() : 'UNKNOWN';
      const normalized = normalizeRoute(rawRoute);
      const routeKey = `${safeMethod} ${normalized}`;
      if (
        !this.routeCounts[routeKey] &&
        Object.keys(this.routeCounts).length >= MAX_UNIQUE_ROUTES
      ) {
        this.routeCounts[`${safeMethod} /OTHER`] =
          (this.routeCounts[`${safeMethod} /OTHER`] || 0) + 1;
      } else {
        this.routeCounts[routeKey] = (this.routeCounts[routeKey] || 0) + 1;
      }

      if (statusCode >= 500) {
        this.statusBuckets['5xx']++;
      } else if (statusCode >= 400) {
        this.statusBuckets['4xx']++;
      } else if (statusCode >= 300) {
        this.statusBuckets['3xx']++;
      } else {
        this.statusBuckets['2xx']++;
      }

      if (this.requestLatencies.length >= MAX_LATENCY_SAMPLES) {
        this.requestLatencies.shift();
      }
      this.requestLatencies.push(typeof durationMs === 'number' ? durationMs : 0);
    } catch {
      // Isolate telemetry error
    }
  }

  recordDbLatency(durationMs: number, success = true): void {
    try {
      this.dbQueries++;
      if (success) {
        this.dbSuccesses++;
      } else {
        this.dbFailures++;
      }

      if (this.dbLatencies.length >= MAX_LATENCY_SAMPLES) {
        this.dbLatencies.shift();
      }
      this.dbLatencies.push(typeof durationMs === 'number' ? durationMs : 0);
    } catch {
      // Isolate telemetry error
    }
  }

  recordProviderCall(
    provider: string,
    _operation: string,
    status: ProviderStatus,
    durationMs: number,
    errorClass?: string,
  ): void {
    try {
      const key = (provider || 'unknown').toLowerCase();
      let stats = this.providerStats.get(key);
      if (!stats) {
        stats = {
          totalCalls: 0,
          successCount: 0,
          failureCount: 0,
          latencies: [],
          lastStatus: status,
          degraded: false,
        };
        this.providerStats.set(key, stats);
      }

      stats.totalCalls++;
      if (status === 'ok') {
        stats.successCount++;
        stats.degraded = false;
      } else {
        stats.failureCount++;
        stats.degraded = true;
        stats.lastErrorClass = sanitizeErrorClass(errorClass);
      }
      stats.lastStatus = status;

      if (stats.latencies.length >= MAX_LATENCY_SAMPLES) {
        stats.latencies.shift();
      }
      stats.latencies.push(typeof durationMs === 'number' ? durationMs : 0);
    } catch {
      // Isolate telemetry error
    }
  }

  recordJob(jobType: string, status: JobStatus, durationMs: number): void {
    try {
      const key = jobType || 'unknown';
      let stats = this.jobStats.get(key);
      if (!stats) {
        stats = { total: 0, completed: 0, failed: 0, latencies: [] };
        this.jobStats.set(key, stats);
      }
      stats.total++;
      if (status === 'completed') {
        stats.completed++;
      } else {
        stats.failed++;
      }
      if (stats.latencies.length >= MAX_LATENCY_SAMPLES) {
        stats.latencies.shift();
      }
      stats.latencies.push(typeof durationMs === 'number' ? durationMs : 0);
    } catch {
      // Isolate telemetry error
    }
  }

  recordRetry(action: string, outcome: RetryOutcome, attempts = 1): void {
    try {
      const key = action || 'unknown';
      let stats = this.retryStats.get(key);
      if (!stats) {
        stats = { totalAttempts: 0, successCount: 0, exhaustedCount: 0 };
        this.retryStats.set(key, stats);
      }
      stats.totalAttempts += attempts || 1;
      if (outcome === 'success') {
        stats.successCount++;
      } else {
        stats.exhaustedCount++;
      }
    } catch {
      // Isolate telemetry error
    }
  }

  recordNotificationSource(
    source: string,
    status: NotificationSourceStatus,
    errorClass?: string,
  ): void {
    try {
      this.notificationSourceStats.set(source || 'unknown', {
        status,
        lastCheckedAt: new Date().toISOString(),
        errorClass: sanitizeErrorClass(errorClass),
      });
    } catch {
      // Isolate telemetry error
    }
  }

  getSnapshot(): TelemetrySnapshot {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const totalRequests = this.requestCount;
    const errorRate = totalRequests > 0 ? this.statusBuckets['5xx'] / totalRequests : 0;

    const providersSnapshot: TelemetrySnapshot['providers'] = {};
    for (const [key, stats] of this.providerStats.entries()) {
      providersSnapshot[key] = {
        totalCalls: stats.totalCalls,
        successRate: stats.totalCalls > 0 ? stats.successCount / stats.totalCalls : 1,
        avgDurationMs: calculateAverage(stats.latencies),
        lastStatus: stats.lastStatus,
        degraded: stats.degraded,
        lastErrorClass: stats.lastErrorClass,
      };
    }

    const jobsSnapshot: TelemetrySnapshot['jobs'] = {};
    for (const [key, stats] of this.jobStats.entries()) {
      jobsSnapshot[key] = {
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed,
        avgDurationMs: calculateAverage(stats.latencies),
      };
    }

    const retriesSnapshot: TelemetrySnapshot['retries'] = {};
    for (const [key, stats] of this.retryStats.entries()) {
      retriesSnapshot[key] = {
        totalAttempts: stats.totalAttempts,
        successCount: stats.successCount,
        exhaustedCount: stats.exhaustedCount,
      };
    }

    const notificationSourcesSnapshot: TelemetrySnapshot['notificationSources'] = {};
    for (const [key, stats] of this.notificationSourceStats.entries()) {
      notificationSourcesSnapshot[key] = {
        status: stats.status,
        lastCheckedAt: stats.lastCheckedAt,
        errorClass: stats.errorClass,
      };
    }

    return {
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      requests: {
        total: totalRequests,
        statusBuckets: { ...this.statusBuckets },
        avgDurationMs: calculateAverage(this.requestLatencies),
        p95DurationMs: calculatePercentile(this.requestLatencies, 95),
        errorRate: Math.round(errorRate * 10000) / 10000,
        routes: { ...this.routeCounts },
      },
      database: {
        totalQueries: this.dbQueries,
        successCount: this.dbSuccesses,
        failureCount: this.dbFailures,
        avgLatencyMs: calculateAverage(this.dbLatencies),
        p95LatencyMs: calculatePercentile(this.dbLatencies, 95),
      },
      providers: providersSnapshot,
      jobs: jobsSnapshot,
      retries: retriesSnapshot,
      notificationSources: notificationSourcesSnapshot,
    };
  }

  isAnyProviderDegraded(): boolean {
    for (const stats of this.providerStats.values()) {
      if (stats.degraded) return true;
    }
    return false;
  }

  reset(): void {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.statusBuckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.requestLatencies = [];
    this.routeCounts = {};
    this.dbQueries = 0;
    this.dbSuccesses = 0;
    this.dbFailures = 0;
    this.dbLatencies = [];
    this.providerStats.clear();
    this.jobStats.clear();
    this.retryStats.clear();
    this.notificationSourceStats.clear();
  }
}

export const telemetry = new TelemetryCollector();
