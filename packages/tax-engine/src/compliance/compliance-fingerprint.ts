import { createHash } from 'crypto';

/**
 * Deterministic JSON stringifier with key sorting.
 */
function stableStringifyInternal(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyInternal(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringifyInternal(v)}`)
    .join(',')}}`;
}

/**
 * Computes a deterministic SHA-256 fingerprint for arbitrary structured payload.
 */
export function computeComplianceFingerprint(payload: unknown): string {
  const serialized = stableStringifyInternal(payload);
  return createHash('sha256').update(serialized).digest('hex');
}
