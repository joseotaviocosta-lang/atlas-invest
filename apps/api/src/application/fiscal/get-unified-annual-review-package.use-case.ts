import { Inject, Injectable } from '@nestjs/common';
import {
  buildUnifiedAnnualReviewPackage,
  exportUnifiedAnnualReviewPackageToCsv,
  serializeUnifiedAnnualReviewPackageToJson,
  type UnifiedAnnualReviewPackage,
} from '@atlas/tax-engine';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { UnifiedAnnualIrpfService } from './get-unified-annual-irpf.use-case';

export interface GetUnifiedAnnualReviewPackageInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
}

/**
 * Phase 4J.2 — Unified Annual Review / Support Package application service.
 *
 * Loads the authoritative 4J.1 `UnifiedAnnualIrpfState` EXACTLY ONCE per
 * request via `UnifiedAnnualIrpfService` (which owns the two-fence snapshot
 * coherence over 4H/4I), then feeds it into the PURE engine assembler
 * `buildUnifiedAnnualReviewPackage` with a `generatedAt` derived from the
 * injected `FISCAL_CLOCK`. It performs NO tax math, never touches the ledger,
 * the portfolio engine, or any 4H/4I low-level implementation, injects NO
 * fiscal evidence/confirmation repository, and persists NOTHING.
 *
 * The package corresponds to exactly one 4J.1 `annualFingerprint`: the state
 * is loaded once and the package is built from that single object, so the
 * body and the fingerprint can never disagree. A source revision racing the
 * load is handled by the unified service fence (rebuild once, else
 * deterministic 422) before this service ever sees a state.
 */
@Injectable()
export class UnifiedAnnualReviewPackageService {
  constructor(
    @Inject(UnifiedAnnualIrpfService)
    private readonly unifiedAnnualIrpfService: UnifiedAnnualIrpfService,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  /** Build the current review package (loads the 4J.1 state once). */
  async getReviewPackage(
    input: GetUnifiedAnnualReviewPackageInput,
  ): Promise<UnifiedAnnualReviewPackage> {
    const state = await this.unifiedAnnualIrpfService.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
    });
    return buildUnifiedAnnualReviewPackage(state, { generatedAt: this.generatedAtIso() });
  }

  /** Build the current review package and serialize it to JSON. */
  async exportReviewPackageJson(input: GetUnifiedAnnualReviewPackageInput): Promise<string> {
    const pkg = await this.getReviewPackage(input);
    return serializeUnifiedAnnualReviewPackageToJson(pkg);
  }

  /** Build the current review package and serialize it to CSV. */
  async exportReviewPackageCsv(input: GetUnifiedAnnualReviewPackageInput): Promise<string> {
    const pkg = await this.getReviewPackage(input);
    return exportUnifiedAnnualReviewPackageToCsv(pkg);
  }

  /**
   * Derive an ISO timestamp from the civil `YYYY-MM-DD` fiscal clock. The clock
   * is overridable in tests, keeping `generatedAt` deterministic. `generatedAt`
   * is EXCLUDED from the package fingerprint by the pure assembler.
   */
  private generatedAtIso(): string {
    return `${this.clock.today()}T00:00:00.000Z`;
  }
}
