/**
 * Opaque fiscal identifiers. Never PII (no CPF, no e-mail) — ADR-238.
 */
declare const fiscalBrand: unique symbol;
type FiscalBrand<T, B extends string> = T & { readonly [fiscalBrand]: B };

/** Stable identity of a derived fiscal event. */
export type FiscalEventId = FiscalBrand<string, 'FiscalEventId'>;

/**
 * Opaque identity of the taxable person. Conceptually distinct from a single
 * PortfolioId (ADR-238); maps to the authenticated user/owner in the
 * application layer.
 */
export type TaxSubjectId = FiscalBrand<string, 'TaxSubjectId'>;

export function createTaxSubjectId(value: string): TaxSubjectId {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('TaxSubjectId must be a non-empty opaque string');
  }
  return value.trim() as TaxSubjectId;
}

/**
 * Derives the canonical fiscal-event identity from the immutable source
 * transaction identity and the projection version. Deterministic: the same
 * source transaction and projection version always yield the same id.
 */
export function deriveFiscalEventId(
  sourceTransactionId: string,
  projectionVersion: string = 'fiscal-projection-v1',
): FiscalEventId {
  return `fev:${projectionVersion}:${sourceTransactionId}` as FiscalEventId;
}
