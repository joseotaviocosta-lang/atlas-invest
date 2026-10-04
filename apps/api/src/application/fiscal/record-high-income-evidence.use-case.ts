import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  IHighIncomeEvidenceRepository,
  HighIncomeEvidenceRow,
  HighIncomeEvidenceWriteOutcome,
} from '@atlas/database';
import { HIGH_INCOME_EVIDENCE_REPOSITORY } from '../../database/tokens';
import { GetAnnualInvestmentIncomeSummaryUseCase } from './get-annual-investment-income-summary.use-case';
import { isValidCalendarYear } from '@atlas/tax-engine';

export type HighIncomeEvidenceTypeInput =
  'CORPORATE_TAX' | 'ANNUAL_ADJUSTMENT_IRPF' | 'ANNUAL_INCOME_TOTAL';

export type HighIncomeEvidenceSourceInput =
  'PJ_FINANCIAL_STATEMENTS' | 'RFB_PREFILLED' | 'TAXPAYER_CONFIRMED';

export interface RecordHighIncomeEvidenceInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly evidenceType: HighIncomeEvidenceTypeInput;
  readonly payerId?: string | null;
  readonly payerType?: string | null;
  readonly profitPeriodExercise?: number | null;
  readonly evidenceMode?: string | null;
  readonly accountingProfit?: string | null;
  readonly irDue?: string | null;
  readonly csllDue?: string | null;
  readonly prouniTaxCredit?: string | null;
  readonly simplifiedRevenue?: string | null;
  readonly adjustmentAmount?: string | null;
  readonly evidenceSource: HighIncomeEvidenceSourceInput;
  readonly createdByPrincipal: string;
}

export interface RecordHighIncomeEvidenceResult {
  readonly outcome: HighIncomeEvidenceWriteOutcome;
  readonly created: boolean;
  readonly record: HighIncomeEvidenceRow;
}

const CORPORATE_PAYER_TYPES = new Set([
  'STANDARD_CORPORATE',
  'INSURANCE_CAPITALIZATION_REGULATED',
  'FINANCIAL_INSTITUTION',
]);

const DECIMAL_PATTERN = /^\d{1,18}(\.\d{1,18})?$/;

function assertDecimal(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!DECIMAL_PATTERN.test(value)) {
    throw new BadRequestException({
      code: 'FISCAL.INVALID_EVIDENCE',
      message: `Invalid decimal for ${field}: must match \\d{1,18}(\\.\\d{1,18})?, got '${value}'.`,
    });
  }
  return value;
}

@Injectable()
export class RecordHighIncomeEvidenceUseCase {
  constructor(
    @Inject(HIGH_INCOME_EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: IHighIncomeEvidenceRepository,
    @Inject(GetAnnualInvestmentIncomeSummaryUseCase)
    private readonly incomeUseCase: GetAnnualInvestmentIncomeSummaryUseCase,
  ) {}

  async execute(input: RecordHighIncomeEvidenceInput): Promise<RecordHighIncomeEvidenceResult> {
    if (!isValidCalendarYear(input.calendarYear)) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_YEAR',
        message: `Invalid calendar year: ${input.calendarYear}. Must be an integer between 1900 and 2100.`,
      });
    }

    const evidenceType = input.evidenceType;
    if (evidenceType !== 'CORPORATE_TAX' && input.payerId) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: `Evidence type ${evidenceType} is not payer-scoped; payerId must be omitted.`,
      });
    }

    // Payer references must resolve through server-owned upstream data.
    let upstreamPin: string | null = null;
    if (evidenceType === 'CORPORATE_TAX') {
      if (!input.payerId) {
        throw new BadRequestException({
          code: 'FISCAL.INVALID_EVIDENCE',
          message: 'CORPORATE_TAX evidence requires payerId.',
        });
      }
      const income = await this.incomeUseCase.execute({
        taxSubjectId: input.taxSubjectId,
        calendarYear: input.calendarYear,
      });
      const payer = income.payers.find((entry) => entry.payerId === input.payerId);
      if (!payer) {
        throw new NotFoundException({
          code: 'FISCAL.FOREIGN_PAYER',
          message: `Payer '${input.payerId}' does not resolve to upstream income for this subject and year.`,
        });
      }
      const { createHash } = await import('node:crypto');
      upstreamPin = createHash('sha256')
        .update(
          [
            payer.payerId,
            payer.dividendGross,
            payer.jcpGross,
            payer.fiiIncomeGross,
            payer.totalWithheld,
          ].join('|'),
          'utf8',
        )
        .digest('hex');
    }

    // Server-controlled authority mapping (client claims are never trusted as-is).
    const authority = this.resolveAuthority(input);

    // Type-specific structural validation.
    if (evidenceType === 'CORPORATE_TAX') {
      this.validateCorporate(input);
    } else {
      this.validateAnnualAmount(input);
    }

    const accountingProfit = assertDecimal(input.accountingProfit, 'accountingProfit');
    const irDue = assertDecimal(input.irDue, 'irDue');
    const csllDue = assertDecimal(input.csllDue, 'csllDue');
    const prouniTaxCredit = assertDecimal(input.prouniTaxCredit, 'prouniTaxCredit');
    const simplifiedRevenue = assertDecimal(input.simplifiedRevenue, 'simplifiedRevenue');
    const adjustmentAmount = assertDecimal(input.adjustmentAmount, 'adjustmentAmount');

    const { outcome, record } = await this.evidenceRepository.create({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
      payerId: input.payerId ?? null,
      evidenceType,
      payerType: input.payerType ?? null,
      profitPeriodExercise: input.profitPeriodExercise ?? null,
      evidenceMode: input.evidenceMode ?? null,
      accountingProfit,
      irDue,
      csllDue,
      prouniTaxCredit,
      simplifiedRevenue,
      adjustmentAmount,
      authority,
      evidenceSource: input.evidenceSource,
      upstreamFingerprint: upstreamPin,
      createdByPrincipal: input.createdByPrincipal,
    });

    return { outcome, created: outcome !== 'IDEMPOTENT', record };
  }

  private resolveAuthority(
    input: RecordHighIncomeEvidenceInput,
  ): 'AUTHORITATIVE' | 'REQUIRES_CONFIRMATION' {
    // Corporate books require source documentation; bare attestation never authorizes.
    if (input.evidenceType === 'CORPORATE_TAX') {
      return input.evidenceSource === 'TAXPAYER_CONFIRMED'
        ? 'REQUIRES_CONFIRMATION'
        : 'AUTHORITATIVE';
    }
    // Annual adjustment / income totals are first-party filing facts; an explicit
    // attestation with complete fields is authoritative (analogous to manual
    // confirmed fiscal inputs). Pre-filled official data is authoritative.
    return 'AUTHORITATIVE';
  }

  private validateCorporate(input: RecordHighIncomeEvidenceInput): void {
    if (!input.payerType || !CORPORATE_PAYER_TYPES.has(input.payerType)) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: `CORPORATE_TAX evidence requires a known payerType (STANDARD_CORPORATE, INSURANCE_CAPITALIZATION_REGULATED, FINANCIAL_INSTITUTION).`,
      });
    }
    if (
      input.profitPeriodExercise === null ||
      input.profitPeriodExercise === undefined ||
      !Number.isInteger(input.profitPeriodExercise) ||
      input.profitPeriodExercise < 1900 ||
      input.profitPeriodExercise > 2100
    ) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: 'CORPORATE_TAX evidence requires profitPeriodExercise (integer year 1900–2100).',
      });
    }
    if (input.evidenceMode !== 'FULL' && input.evidenceMode !== 'SIMPLIFIED') {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: 'CORPORATE_TAX evidence requires evidenceMode FULL or SIMPLIFIED.',
      });
    }
    if (!input.accountingProfit || !input.irDue || !input.csllDue) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: 'CORPORATE_TAX evidence requires accountingProfit, irDue and csllDue.',
      });
    }
  }

  private validateAnnualAmount(input: RecordHighIncomeEvidenceInput): void {
    if (!input.adjustmentAmount) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: `${input.evidenceType} evidence requires adjustmentAmount.`,
      });
    }
  }
}
