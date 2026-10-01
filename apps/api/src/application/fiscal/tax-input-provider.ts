import type {
  FiiTaxEligibilityFacts,
  TaxTradeClassification,
  TaxWithholdingInput,
} from '@atlas/tax-engine';

/**
 * Canonical tax-input provider (Phase 4B.2).
 *
 * Supplies the source facts later verified rules need. It performs NO tax
 * calculation and NEVER estimates. The default production provider is empty:
 * no canonical ingestion source exists yet, so every input is honestly absent
 * and downstream readiness fails closed.
 */
export interface TaxInputProvider {
  getTradeClassifications(
    taxSubjectId: string,
    competence: string,
  ): Promise<readonly TaxTradeClassification[]>;
  getWithholdingInputs(
    taxSubjectId: string,
    competence: string,
  ): Promise<readonly TaxWithholdingInput[]>;
  /** Bulk load of all withholding evidence for the subject (single query; replay range). */
  getAllWithholdingInputs(taxSubjectId: string): Promise<readonly TaxWithholdingInput[]>;
  getFiiEligibilityFacts(
    taxSubjectId: string,
    assetIds: readonly string[],
    asOfDate: string,
  ): Promise<readonly FiiTaxEligibilityFacts[]>;
}

export class EmptyTaxInputProvider implements TaxInputProvider {
  async getTradeClassifications(): Promise<readonly TaxTradeClassification[]> {
    return [];
  }
  async getWithholdingInputs(): Promise<readonly TaxWithholdingInput[]> {
    return [];
  }
  async getAllWithholdingInputs(): Promise<readonly TaxWithholdingInput[]> {
    return [];
  }
  async getFiiEligibilityFacts(): Promise<readonly FiiTaxEligibilityFacts[]> {
    return [];
  }
}
