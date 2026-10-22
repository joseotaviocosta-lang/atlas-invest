import { B3TransportError } from './errors';
import type { B3IntegrationMode } from './environment';

/**
 * Phase 5O-B — secret configuration contract (names only, never values).
 *
 * Every credential is a *reference* (secret-manager key name, file path
 * outside the repo, or runtime-injected handle name). Values never appear in
 * config objects, logs, responses or the frontend. `clientId` is the only
 * non-secret identifier and is safe to log.
 */
export interface B3IntegrationConfig {
  mode: B3IntegrationMode;
  /** HTTPS base URL of the environment (CERT/PROD only). Never hardcoded. */
  baseUrl?: string;
  /** Public OAuth client identifier (not a secret). */
  clientId?: string;
  /** Secret-manager reference for the OAuth client secret. */
  clientSecretReference?: string;
  /** Secret-manager reference for the mTLS client certificate. */
  certificateReference?: string;
  /** Secret-manager reference for the mTLS private key. */
  privateKeyReference?: string;
  /** Per-request timeout in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
  /** Pagination safety cap. Defaults to 100 pages. */
  maxPages?: number;
}

export interface ValidatedB3IntegrationConfig {
  mode: B3IntegrationMode;
  baseUrl: string | null;
  clientId: string | null;
  clientSecretReference: string | null;
  certificateReference: string | null;
  privateKeyReference: string | null;
  timeoutMs: number;
  maxPages: number;
}

const HTTP_URL_PATTERN = /^https:\/\//i;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Fail-closed config validation. `CERT`/`PROD` require an explicit HTTPS
 * base URL plus every credential reference; anything less is a
 * `CONFIGURATION_ERROR`, never a silent downgrade. `DISABLED`/`SIMULATED`
 * carry no network identity at all.
 */
export function validateB3IntegrationConfig(
  config: B3IntegrationConfig,
): ValidatedB3IntegrationConfig {
  const timeoutMs =
    typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs)
      ? Math.min(60_000, Math.max(1_000, Math.floor(config.timeoutMs)))
      : 10_000;
  const maxPages =
    typeof config.maxPages === 'number' && Number.isFinite(config.maxPages)
      ? Math.min(1_000, Math.max(1, Math.floor(config.maxPages)))
      : 100;

  if (config.mode === 'DISABLED' || config.mode === 'SIMULATED') {
    return {
      mode: config.mode,
      baseUrl: null,
      clientId: null,
      clientSecretReference: null,
      certificateReference: null,
      privateKeyReference: null,
      timeoutMs,
      maxPages,
    };
  }

  const missing: string[] = [];
  if (!nonEmpty(config.baseUrl) || !HTTP_URL_PATTERN.test(config.baseUrl.trim())) {
    missing.push('baseUrl (explicit https:// URL)');
  }
  if (!nonEmpty(config.clientId)) missing.push('clientId');
  if (!nonEmpty(config.clientSecretReference)) missing.push('clientSecretReference');
  if (!nonEmpty(config.certificateReference)) missing.push('certificateReference');
  if (!nonEmpty(config.privateKeyReference)) missing.push('privateKeyReference');
  if (missing.length > 0) {
    throw new B3TransportError(
      'CONFIGURATION_ERROR',
      `B3 ${config.mode} mode requires explicit configuration: ${missing.join(', ')}`,
    );
  }
  return {
    mode: config.mode,
    baseUrl: config.baseUrl!.trim(),
    clientId: config.clientId!.trim(),
    clientSecretReference: config.clientSecretReference!.trim(),
    certificateReference: config.certificateReference!.trim(),
    privateKeyReference: config.privateKeyReference!.trim(),
    timeoutMs,
    maxPages,
  };
}
