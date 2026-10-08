import { createHash } from 'node:crypto';
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { Money } from '@atlas/domain';
import {
  calculateHighIncomeMinimumTax,
  isValidCalendarYear,
  type CorporatePayerEvidenceInput,
  type HighIncomeEvidenceStateInput,
  type HighIncomeIncomeItemInput,
  type HighIncomeTaxPaidFactInput,
} from '@atlas/tax-engine';
import type { AnnualInvestmentIncomeSummaryReadModel as IncomeSummaryReadModel } from './annual-investment-income.read-model';
import { IHighIncomeEvidenceRepository, HighIncomeEvidenceRow } from '@atlas/database';
import { HIGH_INCOME_EVIDENCE_REPOSITORY } from '../../database/tokens';
import { GetAnnualCapitalMarketSummaryUseCase } from './get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from './get-annual-investment-income-summary.use-case';
import type { UnifiedLoadScope } from './in-flight-memo';
import {
  AnnualHighIncomeAssessmentReadModel,
  mapAnnualHighIncomeAssessmentToReadModel,
  mapHighIncomeEvidenceRowToState,
} from './annual-high-income.read-model';

export interface GetAnnualHighIncomeAssessmentInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /**
   * Optional composed-load scope (Phase 4J.1) forwarded to the transitive
   * capital-market / investment-income calls so the unified orchestration
   * de-duplicates them against one load snapshot. Absent for the standalone
   * 4I route.
   */
  readonly scope?: UnifiedLoadScope;
}

interface PayerAggregatePin {
  readonly payerId: string;
  readonly pin: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function payerUpstreamPin(input: {
  payerId: string;
  dividendGross: string;
  jcpGross: string;
  fiiIncomeGross: string;
  totalWithheld: string;
}): string {
  return sha256Hex(
    [
      input.payerId,
      input.dividendGross,
      input.jcpGross,
      input.fiiIncomeGross,
      input.totalWithheld,
    ].join('|'),
  );
}

function isPositiveDecimal(value: string): boolean {
  return Money.from(value, 'BRL').isPositive();
}

@Injectable()
export class GetAnnualHighIncomeAssessmentUseCase {
  constructor(
    @Inject(GetAnnualCapitalMarketSummaryUseCase)
    private readonly capitalMarketUseCase: GetAnnualCapitalMarketSummaryUseCase,
    @Inject(GetAnnualInvestmentIncomeSummaryUseCase)
    private readonly incomeUseCase: GetAnnualInvestmentIncomeSummaryUseCase,
    @Inject(HIGH_INCOME_EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: IHighIncomeEvidenceRepository,
  ) {}

  async execute(
    input: GetAnnualHighIncomeAssessmentInput,
  ): Promise<AnnualHighIncomeAssessmentReadModel> {
    if (!isValidCalendarYear(input.calendarYear)) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_YEAR',
        message: `Invalid calendar year: ${input.calendarYear}. Must be an integer between 1900 and 2100.`,
      });
    }

    // Version fence: evidence rows are append-only, so any concurrent write adds a
    // row (count grows, maxUpdatedAt advances). If the watermark is identical
    // before and after the build, no write landed mid-calculation. Otherwise the
    // assessment rebuilds once against fresh state; a persistent race fails
    // closed instead of claiming a stale authoritative status.
    const first = await this.buildWithFence(input.taxSubjectId, input.calendarYear, input.scope);
    if (first.consistent) {
      return first.assessment;
    }
    const second = await this.buildWithFence(input.taxSubjectId, input.calendarYear, input.scope);
    if (second.consistent) {
      return second.assessment;
    }
    throw new BadRequestException({
      code: 'FISCAL.SNAPSHOT_INCONSISTENT',
      message: 'High-income evidence changed during assessment; please retry.',
    });
  }

  private async buildWithFence(
    taxSubjectId: string,
    calendarYear: number,
    scope: UnifiedLoadScope | undefined,
  ): Promise<{ assessment: AnnualHighIncomeAssessmentReadModel; consistent: boolean }> {
    const before = await this.evidenceRepository.watermark({ taxSubjectId, calendarYear });
    const assessment = await this.buildAssessment(taxSubjectId, calendarYear, scope);
    const after = await this.evidenceRepository.watermark({ taxSubjectId, calendarYear });
    return {
      assessment,
      consistent: after.count === before.count && after.maxUpdatedAt === before.maxUpdatedAt,
    };
  }

  private async buildAssessment(
    taxSubjectId: string,
    calendarYear: number,
    scope: UnifiedLoadScope | undefined,
  ): Promise<AnnualHighIncomeAssessmentReadModel> {
    // 1. Authoritative 4H annual facts (consumed, never recomputed).
    const [capitalMarket, income] = await Promise.all([
      this.capitalMarketUseCase.execute({ taxSubjectId, calendarYear, scope }),
      this.incomeUseCase.execute({ taxSubjectId, calendarYear, scope }),
    ]);

    // 2. Current evidence rows (bulk, single query).
    const evidenceRows = await this.evidenceRepository.listCurrentBySubjectYear({
      taxSubjectId,
      calendarYear,
    });

    // 3. Assemble 4I.1 snapshot inputs from authoritative 4H facts.
    const items = this.assembleIncomeItems(capitalMarket.months, income);
    const withholdingFacts = this.assembleWithholdingFacts(income);
    const pins = this.computePayerPins(income);

    // 4. Map persisted evidence to engine inputs (fail-closed on stale/conflict).
    const staleById = new Map<string, boolean>();
    const { corporateEvidence, taxPaidFacts, authoritativeTotal, evidenceStates } =
      this.mapEvidenceToEngineInputs(evidenceRows, pins, income.fingerprint, staleById);

    const calculation = calculateHighIncomeMinimumTax({
      calendarYear,
      taxSubjectId,
      currency: 'BRL',
      items,
      taxPaidFacts: [...withholdingFacts, ...taxPaidFacts],
      evidenceStates,
      authoritativeTotalAnnualIncome: authoritativeTotal,
      corporateEvidence,
    });

    // 5. Upstream blocking: a BLOCKED 4H income summary cannot yield authority.
    let status = calculation.status;
    let blockingReasons = calculation.blockingReasons;
    if (income.status === 'BLOCKED') {
      status = 'BLOCKED';
      blockingReasons = [...blockingReasons, 'BLOCKED_UPSTREAM_4H_INCOME'];
    }

    return mapAnnualHighIncomeAssessmentToReadModel({
      calculation: { ...calculation, status, blockingReasons },
      status,
      evidence: evidenceRows.map((row) =>
        mapHighIncomeEvidenceRowToState(row, staleById.get(row.id) ?? false),
      ),
      upstreamIncomeStatus: income.status,
      upstreamIncomeFingerprint: income.fingerprint,
      upstreamCapitalMarketFingerprint: capitalMarket.fingerprint,
    });
  }

  private assembleIncomeItems(
    months: ReadonlyArray<{
      normalEquities: { profitOrLoss: string };
      dayTrade: { profitOrLoss: string };
      fii: { profitOrLoss: string };
    }>,
    income: IncomeSummaryReadModel,
  ): HighIncomeIncomeItemInput[] {
    const items: HighIncomeIncomeItemInput[] = [];

    // 4H.4 payer aggregates → dividend / JCP / FII items (canonical payer identity).
    for (const payer of income.payers) {
      if (isPositiveDecimal(payer.dividendGross)) {
        items.push({
          itemId: `div-${payer.payerId}`,
          category: 'DIVIDEND',
          amount: payer.dividendGross,
          currency: 'BRL',
          payerId: payer.payerId,
          payerDisplayName: payer.payerDisplayName,
        });
      }
      if (isPositiveDecimal(payer.jcpGross)) {
        items.push({
          itemId: `jcp-${payer.payerId}`,
          category: 'JCP',
          amount: payer.jcpGross,
          currency: 'BRL',
          payerId: payer.payerId,
          payerDisplayName: payer.payerDisplayName,
        });
      }
      if (isPositiveDecimal(payer.fiiIncomeGross)) {
        items.push({
          itemId: `fii-${payer.payerId}`,
          category: 'FII_INCOME',
          amount: payer.fiiIncomeGross,
          currency: 'BRL',
          payerId: payer.payerId,
          payerDisplayName: payer.payerDisplayName,
          // The upstream API classifies listed FII distributions as verified-exempt;
          // the foundation consumes that authoritative classification as-is.
          fiiEligibility: 'ELIGIBLE',
        });
      }
    }

    // 4H.3 monthly net results → annual category gains (exact assembly of
    // authoritative monthly facts; positive annual nets only — a non-positive
    // annual net is not income and contributes no item).
    const sums = {
      EQUITY_CAPITAL_GAIN: Money.zero('BRL'),
      EQUITY_DAY_TRADE_GAIN: Money.zero('BRL'),
      FII_CAPITAL_GAIN: Money.zero('BRL'),
    };
    for (const month of months) {
      sums.EQUITY_CAPITAL_GAIN = sums.EQUITY_CAPITAL_GAIN.add(
        Money.from(month.normalEquities.profitOrLoss, 'BRL'),
      );
      sums.EQUITY_DAY_TRADE_GAIN = sums.EQUITY_DAY_TRADE_GAIN.add(
        Money.from(month.dayTrade.profitOrLoss, 'BRL'),
      );
      sums.FII_CAPITAL_GAIN = sums.FII_CAPITAL_GAIN.add(Money.from(month.fii.profitOrLoss, 'BRL'));
    }
    (Object.keys(sums) as Array<keyof typeof sums>).forEach((category, index) => {
      const total = sums[category];
      if (total.isPositive()) {
        items.push({
          itemId: `cap-${index}`,
          category,
          amount: total.amount,
          currency: 'BRL',
        });
      }
    });

    return items;
  }

  private assembleWithholdingFacts(income: IncomeSummaryReadModel): HighIncomeTaxPaidFactInput[] {
    const facts: HighIncomeTaxPaidFactInput[] = [];
    if (isPositiveDecimal(income.jcp.totalWithheldTax)) {
      facts.push({
        factId: 'wh-jcp',
        kind: 'EXCLUSIVE_SOURCE_WITHHOLDING',
        amount: income.jcp.totalWithheldTax,
        currency: 'BRL',
      });
    }
    if (isPositiveDecimal(income.dividends.totalWithheldTax)) {
      facts.push({
        factId: 'wh-div',
        kind: 'ART_6A_ANTICIPATED_WITHHOLDING',
        amount: income.dividends.totalWithheldTax,
        currency: 'BRL',
      });
    }
    return facts;
  }

  private computePayerPins(income: IncomeSummaryReadModel): Map<string, PayerAggregatePin> {
    const pins = new Map<string, PayerAggregatePin>();
    for (const payer of income.payers) {
      pins.set(payer.payerId, {
        payerId: payer.payerId,
        pin: payerUpstreamPin({
          payerId: payer.payerId,
          dividendGross: payer.dividendGross,
          jcpGross: payer.jcpGross,
          fiiIncomeGross: payer.fiiIncomeGross,
          totalWithheld: payer.totalWithheld,
        }),
      });
    }
    return pins;
  }

  private mapEvidenceToEngineInputs(
    rows: HighIncomeEvidenceRow[],
    pins: Map<string, PayerAggregatePin>,
    incomeFingerprint: string,
    staleById: Map<string, boolean>,
  ): {
    corporateEvidence: CorporatePayerEvidenceInput[];
    taxPaidFacts: HighIncomeTaxPaidFactInput[];
    authoritativeTotal: string | null;
    evidenceStates: HighIncomeEvidenceStateInput[];
  } {
    const corporateEvidence: CorporatePayerEvidenceInput[] = [];
    const taxPaidFacts: HighIncomeTaxPaidFactInput[] = [];
    const evidenceStates: HighIncomeEvidenceStateInput[] = [];
    let authoritativeTotal: string | null = null;

    for (const row of rows) {
      if (row.evidenceType === 'CORPORATE_TAX') {
        const pin = row.payerId ? (pins.get(row.payerId)?.pin ?? null) : null;
        const stale =
          row.upstreamFingerprint !== null && pin !== null && row.upstreamFingerprint !== pin;
        staleById.set(row.id, stale);
        if (row.conflictStatus === 'CONFLICT') {
          corporateEvidence.push(this.toCorporateInput(row, true, false));
          continue;
        }
        corporateEvidence.push(this.toCorporateInput(row, false, stale));
        if (!stale && row.authority === 'AUTHORITATIVE') {
          evidenceStates.push({
            requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            status: 'SATISFIED',
            subjectId: row.payerId ?? row.taxSubjectId,
          });
        }
        continue;
      }

      if (row.evidenceType === 'ANNUAL_ADJUSTMENT_IRPF') {
        const stale =
          row.upstreamFingerprint !== null && row.upstreamFingerprint !== incomeFingerprint;
        staleById.set(row.id, stale);
        if (
          !stale &&
          row.conflictStatus !== 'CONFLICT' &&
          row.authority === 'AUTHORITATIVE' &&
          row.adjustmentAmount !== null
        ) {
          taxPaidFacts.push({
            factId: `adj-${row.id}`,
            kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE',
            amount: row.adjustmentAmount,
            currency: 'BRL',
          });
          evidenceStates.push({
            requirement: 'ANNUAL_ADJUSTMENT_TAX_DUE',
            status: 'SATISFIED',
          });
        }
        continue;
      }

      if (row.evidenceType === 'ANNUAL_INCOME_TOTAL') {
        const stale =
          row.upstreamFingerprint !== null && row.upstreamFingerprint !== incomeFingerprint;
        staleById.set(row.id, stale);
        if (
          !stale &&
          row.conflictStatus !== 'CONFLICT' &&
          row.authority === 'AUTHORITATIVE' &&
          row.adjustmentAmount !== null
        ) {
          authoritativeTotal = row.adjustmentAmount;
        }
        continue;
      }
    }

    if (taxPaidFacts.length > 0 || corporateEvidence.length > 0) {
      evidenceStates.push({ requirement: 'WITHHOLDING_EVIDENCE', status: 'SATISFIED' });
    }

    return { corporateEvidence, taxPaidFacts, authoritativeTotal, evidenceStates };
  }

  private toCorporateInput(
    row: HighIncomeEvidenceRow,
    conflict: boolean,
    stale: boolean,
  ): CorporatePayerEvidenceInput {
    return {
      evidenceId: row.id,
      payerId: row.payerId ?? row.payerKey,
      payerType: (row.payerType ?? 'UNKNOWN') as CorporatePayerEvidenceInput['payerType'],
      profitPeriodExercise: row.profitPeriodExercise ?? 0,
      mode: (row.evidenceMode ?? 'FULL') as CorporatePayerEvidenceInput['mode'],
      accountingProfit: row.accountingProfit ?? '0',
      irDue: row.irDue ?? '0',
      csllDue: row.csllDue ?? '0',
      prouniTaxCredit: row.prouniTaxCredit,
      simplifiedRevenue: row.simplifiedRevenue,
      evidenceAuthority:
        !stale && row.authority === 'AUTHORITATIVE' ? 'AUTHORITATIVE' : 'REQUIRES_CONFIRMATION',
      evidenceSource: row.evidenceSource as CorporatePayerEvidenceInput['evidenceSource'],
      hasConflictingEvidence: conflict,
    };
  }
}
