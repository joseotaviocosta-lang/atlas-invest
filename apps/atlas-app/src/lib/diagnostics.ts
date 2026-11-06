import { getRuntimeConfig } from '../config/runtime';
import { isAndroidUserAgent } from './api';

export interface SanitizedDiagnosticError {
  timestamp: string;
  context?: string;
  message: string;
  code?: string;
  name?: string;
}

export interface SanitizedDiagnosticPackage {
  app: {
    name: string;
    version: string;
    environment: string;
    buildType: string;
    commitSha: string;
    buildDate: string;
  };
  device: {
    platform: 'Windows' | 'Android' | 'Browser';
    isTauri: boolean;
    userAgent: string;
    isOnline: boolean;
    screenResolution?: string;
  };
  network: {
    apiHost: string;
    isSecure: boolean;
  };
  session: {
    isAuthenticated: boolean;
    hasActivePortfolio: boolean;
  };
  recentErrors: SanitizedDiagnosticError[];
  exportedAt: string;
}

const MAX_ERROR_HISTORY = 10;
const errorHistory: SanitizedDiagnosticError[] = [];

/**
 * Strips potentially sensitive information such as Bearer tokens,
 * passwords, CPFs, or exact financial currency strings from diagnostic error logs.
 */
export function sanitizeLogString(raw: string): string {
  if (!raw) return '';
  return raw
    // Mask Bearer authorization headers
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [MASKED_TOKEN]')
    // Mask raw JWT tokens
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[MASKED_JWT]')
    // Mask password parameters
    .replace(/"password":\s*"[^"]+"/gi, '"password":"[MASKED]"')
    // Mask CPF patterns (11 digits or formatted 000.000.000-00)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[MASKED_CPF]')
    .replace(/\b\d{11}\b/g, '[MASKED_NUMERIC_ID]')
    // Mask monetary balances: R$ 1.234.567,89 -> [MASKED_AMOUNT]
    .replace(/R\$\s*[\d.]+(?:,\d{2})?/gi, '[MASKED_AMOUNT]');
}

export function recordDiagnosticError(error: unknown, context?: string): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';

  const name = error instanceof Error ? error.name : undefined;

  const item: SanitizedDiagnosticError = {
    timestamp: new Date().toISOString(),
    context: context ? sanitizeLogString(context) : undefined,
    message: sanitizeLogString(message),
    name,
  };

  errorHistory.push(item);
  if (errorHistory.length > MAX_ERROR_HISTORY) {
    errorHistory.shift();
  }
}

export function getDiagnosticErrorHistory(): readonly SanitizedDiagnosticError[] {
  return [...errorHistory];
}

export function clearDiagnosticErrorHistory(): void {
  errorHistory.length = 0;
}

export function generateSanitizedDiagnostics(options?: {
  isAuthenticated?: boolean;
  hasActivePortfolio?: boolean;
}): SanitizedDiagnosticPackage {
  const config = getRuntimeConfig();
  const isAndroid = isAndroidUserAgent();
  const platform = config.isTauri ? (isAndroid ? 'Android' : 'Windows') : 'Browser';

  let apiHost = 'unknown';
  let isSecure = false;
  try {
    const parsed = new URL(config.apiUrl);
    apiHost = parsed.hostname;
    isSecure = parsed.protocol === 'https:';
  } catch {
    apiHost = sanitizeLogString(config.apiUrl);
  }

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const screenResolution =
    typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight} (dpr: ${window.devicePixelRatio || 1})`
      : undefined;

  return {
    app: {
      name: 'Atlas',
      version: config.version,
      environment: config.environment,
      buildType: config.buildType,
      commitSha: config.commitSha,
      buildDate: config.buildDate,
    },
    device: {
      platform,
      isTauri: config.isTauri,
      userAgent: typeof navigator !== 'undefined' ? sanitizeLogString(navigator.userAgent) : 'unknown',
      isOnline,
      screenResolution,
    },
    network: {
      apiHost,
      isSecure,
    },
    session: {
      isAuthenticated: Boolean(options?.isAuthenticated),
      hasActivePortfolio: Boolean(options?.hasActivePortfolio),
    },
    recentErrors: [...errorHistory],
    exportedAt: new Date().toISOString(),
  };
}

export async function exportDiagnostics(options?: {
  isAuthenticated?: boolean;
  hasActivePortfolio?: boolean;
}): Promise<{ success: boolean; mode: 'download' | 'clipboard'; content: string }> {
  const data = generateSanitizedDiagnostics(options);
  const jsonContent = JSON.stringify(data, null, 2);

  if (typeof document !== 'undefined') {
    try {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atlas-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true, mode: 'download', content: jsonContent };
    } catch {
      // Fallback to clipboard if file download is blocked (e.g. in some WebViews)
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(jsonContent);
    return { success: true, mode: 'clipboard', content: jsonContent };
  }

  return { success: true, mode: 'clipboard', content: jsonContent };
}
