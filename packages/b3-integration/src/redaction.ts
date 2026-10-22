const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cpf|cnpj|cert|private|credential|api[_-]?key|client[_-]?secret/i;

export const REDACTED = '[REDACTED]';

/**
 * Phase 5O-B — deep secret redaction for anything that may reach logs.
 * Plain objects and arrays are cloned with matching keys replaced;
 * primitives pass through. Never throws: on unexpected shapes returns the
 * redaction marker.
 */
export function redactSensitiveKeys(value: unknown): unknown {
  try {
    return redactValue(value);
  } catch {
    return REDACTED;
  }
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry);
    }
    return output;
  }
  return value;
}

/**
 * Log-safe transport summary: endpoint identity, counts and freshness only.
 * Amounts, payloads, tokens, documents and personal identifiers never belong
 * in observability records.
 */
export interface B3LogSummaryInput {
  endpoint: string;
  status: number | null;
  itemCount: number;
  pageCount: number;
  retryCount: number;
  sourceAsOf: string | null;
  correlationId: string | null;
}

export function summarizeB3ResultForLog(input: B3LogSummaryInput): Record<string, unknown> {
  return {
    endpoint: input.endpoint,
    status: input.status,
    itemCount: input.itemCount,
    pageCount: input.pageCount,
    retryCount: input.retryCount,
    sourceAsOf: input.sourceAsOf,
    correlationId: input.correlationId,
  };
}
