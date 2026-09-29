import { createHash, createHmac } from 'node:crypto';

/**
 * Phase 4F — hashing for the DARF handoff record and the taxpayer identity
 * boundary. The raw CPF/CNPJ is never persisted: only an HMAC-SHA256 reference
 * (peppered) is stored (ADR-286).
 */

const IDENTITY_PEPPER = process.env.TAXPAYER_IDENTITY_PEPPER ?? 'atlas-dev-taxpayer-pepper';

/** sha256 hex of a canonical handoff fingerprint. */
export function hashDarfHandoffFingerprint(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** HMAC-SHA256 hex of a normalized taxpayer identifier (never the raw value). */
export function hashTaxpayerIdentifier(normalizedIdentifier: string): string {
  return createHmac('sha256', IDENTITY_PEPPER).update(normalizedIdentifier, 'utf8').digest('hex');
}
