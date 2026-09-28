import type { TaxAssetCategory } from '@atlas/tax-engine';

/**
 * Phase 4B.4 — provider-neutral tax-input source adapters.
 *
 * Adapters translate an external canonical source into the canonical tax-input
 * payloads defined in 4B.2/4B.3. Provider-specific types NEVER cross this
 * boundary. If no real source exists the registry stays empty; nothing is
 * fabricated (ADR-259).
 */

export interface TaxInputSourceRecord<TPayload> {
  readonly provider: string;
  readonly sourceType: string;
  readonly sourceReference: string;
  readonly importId?: string;
  readonly sourceDocumentReference?: string;
  readonly payload: TPayload;
}

export interface TradeClassificationPayload {
  readonly transactionId: string;
  readonly classification: 'NORMAL' | 'DAY_TRADE' | 'UNKNOWN';
  readonly effectiveDate: string; // YYYY-MM-DD
}

export interface WithholdingPayload {
  readonly competence: string; // YYYY-MM
  readonly economicDate: string; // YYYY-MM-DD
  readonly category: TaxAssetCategory;
  readonly amount: string | null; // exact decimal or null (UNKNOWN)
  readonly currency: string;
  readonly status: 'CONFIRMED' | 'UNVERIFIED' | 'UNKNOWN';
}

export interface FiiEligibilityPayload {
  readonly assetId: string;
  readonly asOfDate: string; // YYYY-MM-DD
  readonly holderCount: number | null;
  readonly investorOwnershipPercent: string | null;
  readonly isExchangeTraded: boolean | null;
  readonly status: 'KNOWN' | 'PARTIAL' | 'UNKNOWN';
}

export interface TaxTradeClassificationSourceAdapter {
  readonly provider: string;
  fetchTradeClassifications(
    taxSubjectId: string,
    competence: string,
  ): Promise<readonly TaxInputSourceRecord<TradeClassificationPayload>[]>;
}

export interface TaxWithholdingSourceAdapter {
  readonly provider: string;
  fetchWithholdingInputs(
    taxSubjectId: string,
    competence: string,
  ): Promise<readonly TaxInputSourceRecord<WithholdingPayload>[]>;
}

export interface FiiTaxEligibilitySourceAdapter {
  readonly provider: string;
  fetchFiiEligibilityFacts(
    taxSubjectId: string,
    assetIds: readonly string[],
    asOfDate: string,
  ): Promise<readonly TaxInputSourceRecord<FiiEligibilityPayload>[]>;
}

export interface TaxInputAdapterRegistry {
  readonly tradeClassificationAdapters: readonly TaxTradeClassificationSourceAdapter[];
  readonly withholdingAdapters: readonly TaxWithholdingSourceAdapter[];
  readonly fiiEligibilityAdapters: readonly FiiTaxEligibilitySourceAdapter[];
}

/** No external canonical tax-input source is currently integrated. */
export const EMPTY_TAX_INPUT_ADAPTER_REGISTRY: TaxInputAdapterRegistry = Object.freeze({
  tradeClassificationAdapters: Object.freeze([]),
  withholdingAdapters: Object.freeze([]),
  fiiEligibilityAdapters: Object.freeze([]),
});
