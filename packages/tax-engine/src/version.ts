/**
 * Phase 4A — Brazilian Tax Engine Foundation.
 *
 * Versioning is explicit and immutable: the projection version is frozen and
 * forms part of every derived FiscalEventId so that identical source
 * transactions always generate identical fiscal identities (ADR-236, ADR-237).
 */
export const TAX_ENGINE_VERSION = '0.1.0';

/** Version of the Transaction -> FiscalEvent projection semantics. */
export const FISCAL_PROJECTION_VERSION = 'fiscal-projection-v1';

/** Version of the 4B monthly tax-liability calculation semantics. */
export const CALCULATION_VERSION = 'tax-calculation-v1';

/** Default fiscal jurisdiction. Phase 4A only models the Brazilian foundation. */
export const DEFAULT_TAX_JURISDICTION = 'BR';

/** Currencies with complete fiscal treatment in Phase 4A, and only these. */
export const SUPPORTED_FISCAL_CURRENCIES: readonly string[] = Object.freeze(['BRL']);
