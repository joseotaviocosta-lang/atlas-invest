/**
 * Phase 4F — Taxpayer identity boundary (pure domain).
 *
 * Official DARF generation via Sicalc requires the taxpayer's CPF (and date of
 * birth for pessoa física) to be typed on the official service. Atlas never
 * needs to persist the raw identifier: it keeps only a masked display form and
 * an opaque server-side reference (hash) outside `@atlas/tax-engine`. The raw
 * CPF must never cross into the tax engine, logs, telemetry or AI grounding
 * (ADR-286).
 */
export const TAXPAYER_IDENTITY_TYPES = ['CPF', 'CNPJ'] as const;
export type TaxpayerIdentityType = (typeof TAXPAYER_IDENTITY_TYPES)[number];

export interface TaxpayerIdentityReference {
  readonly userId: string;
  readonly identityAvailable: boolean;
  readonly identityType: TaxpayerIdentityType | null;
  /** Masked display form only (e.g. `***.***.789-**`). Never the raw value. */
  readonly maskedIdentifier: string | null;
  /** Opaque server-side reference (HMAC-SHA256). Never the raw value. */
  readonly secureReference: string | null;
}

/** Digits-only normalization; returns `null` for malformed input. */
export function normalizeTaxpayerIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits;
}

/** CPF format + check-digit validation (11 digits). Pure, no I/O. */
export function isCanonicalCpf(value: unknown): boolean {
  const digits = normalizeTaxpayerIdentifier(value);
  if (!digits || digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const d = digits.split('').map((c) => Number(c));
  const check = (start: number): number => {
    let sum = 0;
    for (let i = 0; i < start; i += 1) sum += d[i]! * (start + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return check(9) === d[9] && check(10) === d[10];
}

/** CNPJ format + check-digit validation (14 digits). Pure, no I/O. */
export function isCanonicalCnpj(value: unknown): boolean {
  const digits = normalizeTaxpayerIdentifier(value);
  if (!digits || digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const d = digits.split('').map((c) => Number(c));
  const check = (length: number): number => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += d[i]! * weights[i]!;
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return check(12) === d[12] && check(13) === d[13];
}

/**
 * Masks a CPF for display: `***.***.789-**` (keeps the middle block, which is
 * the conventional public discriminator). Returns `null` for malformed input.
 */
export function maskCpf(value: unknown): string | null {
  const digits = normalizeTaxpayerIdentifier(value);
  if (!digits || digits.length !== 11) return null;
  return `***.***.${digits.slice(6, 9)}-**`;
}

/** Masks a CNPJ for display, keeping only the check digits. */
export function maskCnpj(value: unknown): string | null {
  const digits = normalizeTaxpayerIdentifier(value);
  if (!digits || digits.length !== 14) return null;
  return `**.***.***/****-${digits.slice(12, 14)}`;
}

export function maskTaxpayerIdentifier(value: unknown, type: TaxpayerIdentityType): string | null {
  return type === 'CPF' ? maskCpf(value) : maskCnpj(value);
}

/** True when the identifier matches its declared type (format + check digits). */
export function isValidTaxpayerIdentifier(value: unknown, type: TaxpayerIdentityType): boolean {
  return type === 'CPF' ? isCanonicalCpf(value) : isCanonicalCnpj(value);
}
