import { Inject, Injectable } from '@nestjs/common';
import {
  buildHighIncomeAnnualReviewPackage,
  exportHighIncomeReviewPackageToCsv,
  serializeHighIncomeReviewPackageToJson,
  type HighIncomeReviewAssessmentInput,
  type HighIncomeReviewPackage,
} from '@atlas/tax-engine';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetAnnualHighIncomeAssessmentUseCase } from './get-annual-high-income-assessment.use-case';

export interface GetHighIncomeAnnualReviewPackageInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
}

/**
 * Phase 4I.6 — High-Income Annual Review / Support Package application service.
 *
 * Loads the authoritative 4I.4 assessment EXACTLY ONCE per request via
 * `GetAnnualHighIncomeAssessmentUseCase`, then feeds it into the PURE engine
 * assembler `buildHighIncomeAnnualReviewPackage` with a `generatedAt` derived
 * from the injected `FISCAL_CLOCK`. It performs NO tax math, never re-runs the
 * frozen high-income tax calculation, and touches NO repository directly.
 *
 * There is NO API-layer supported-year window: the frozen engine owns the
 * supported window and emits `UNSUPPORTED_YEAR` for out-of-window (but
 * structurally valid) years, which the assembler maps to package status
 * `UNSUPPORTED`. The only year guard remains the structural `isValidCalendarYear`
 * range check inside the 4I.4 use-case (→ 400 `FISCAL.INVALID_YEAR`).
 */
@Injectable()
export class HighIncomeAnnualReviewPackageService {
  constructor(
    @Inject(GetAnnualHighIncomeAssessmentUseCase)
    private readonly assessmentUseCase: GetAnnualHighIncomeAssessmentUseCase,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  /** Build the current review package (loads the 4I.4 result once). */
  async getReviewPackage(
    input: GetHighIncomeAnnualReviewPackageInput,
  ): Promise<HighIncomeReviewPackage> {
    // Single load of the authoritative 4I.4 assessment. The read model is
    // structurally identical to the engine assembler's input shape.
    const assessment = await this.assessmentUseCase.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
    });

    const generatedAt = this.generatedAtIso();
    return buildHighIncomeAnnualReviewPackage(assessment as HighIncomeReviewAssessmentInput, {
      generatedAt,
    });
  }

  /** Build the current review package and serialize it to JSON. */
  async exportReviewPackageJson(input: GetHighIncomeAnnualReviewPackageInput): Promise<string> {
    const pkg = await this.getReviewPackage(input);
    return serializeHighIncomeReviewPackageToJson(pkg);
  }

  /** Build the current review package and serialize it to CSV. */
  async exportReviewPackageCsv(input: GetHighIncomeAnnualReviewPackageInput): Promise<string> {
    const pkg = await this.getReviewPackage(input);
    return exportHighIncomeReviewPackageToCsv(pkg);
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
