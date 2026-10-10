import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Money } from '@atlas/domain';
import {
  ITaxComplianceActionRepository,
  ITaxObligationRepository,
  IPortfolioRepository,
} from '@atlas/database';
import {
  projectTaxComplianceTimeline,
  type MonthlyComplianceSource,
  type TaxComplianceObligationKind,
  type TaxComplianceObligationStatus,
  type TaxComplianceTimeline,
  type TaxComplianceUserActionRecord,
  type TaxComplianceUserActionType,
  type UnifiedAnnualIrpfState,
} from '@atlas/tax-engine';
import {
  TAX_COMPLIANCE_ACTION_REPOSITORY,
  TAX_OBLIGATION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { UnifiedAnnualIrpfService } from './get-unified-annual-irpf.use-case';

export interface GetTaxComplianceTimelineInput {
  readonly taxSubjectId: string;
  readonly calendarYear?: number;
  readonly status?: string;
  readonly kind?: string;
  readonly period?: string;
  readonly portfolioId?: string;
}

@Injectable()
export class GetTaxComplianceTimelineUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_ACTION_REPOSITORY)
    private readonly actionRepository: ITaxComplianceActionRepository,
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(UnifiedAnnualIrpfService)
    private readonly unifiedAnnualIrpfService: UnifiedAnnualIrpfService,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(input: GetTaxComplianceTimelineInput): Promise<TaxComplianceTimeline> {
    if (input.portfolioId) {
      const portfolio = await this.portfolioRepository.findByIdAndUserId(
        input.portfolioId,
        input.taxSubjectId,
      );
      if (!portfolio) {
        throw new NotFoundException(`Portfolio '${input.portfolioId}' was not found.`);
      }
    }

    const today = this.clock.today();
    const currentYear = parseInt(today.substring(0, 4), 10);
    const calendarYear = input.calendarYear ?? currentYear;

    // 1. Load Monthly Obligations for the calendar year
    const monthlyRows = await this.obligationRepository.list(input.taxSubjectId, {});
    const yearPrefix = `${calendarYear}-`;
    const monthlySources: MonthlyComplianceSource[] = monthlyRows
      .filter((row) => row.competence.startsWith(yearPrefix))
      .map((row) => {
        let dueDateStr: string | null = null;
        if (row.dueDate) {
          dueDateStr =
            typeof row.dueDate === 'string'
              ? (row.dueDate as string).slice(0, 10)
              : row.dueDate.toISOString().slice(0, 10);
        }
        return {
          competence: row.competence,
          revenueCode: row.revenueCode,
          bucket: row.taxBucket,
          principalAmount: row.principalAmount
            ? Money.from(row.principalAmount.toString(), row.currency ?? 'BRL').amount
            : null,
          currency: row.currency,

          dueDate: dueDateStr,
          status: row.status,
          reasonCode: row.reasonCode,
          darfReadiness: row.darfReadiness,
          sourceFingerprint: row.liabilityFingerprint,
        };
      });

    // 2. Load Unified Annual State (if available for calendar year)
    let annualState: UnifiedAnnualIrpfState | null = null;
    try {
      annualState = await this.unifiedAnnualIrpfService.execute({
        taxSubjectId: input.taxSubjectId,
        calendarYear,
      });
    } catch {
      // Annual calculation may not have activity or may fail closed safely without blocking timeline
      annualState = null;
    }

    // 3. Load User Actions
    const actionRows = await this.actionRepository.listBySubject({
      taxSubjectId: input.taxSubjectId,
    });
    const userActions: TaxComplianceUserActionRecord[] = actionRows.map((row) => ({
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      obligationKey: row.obligationKey,
      actionType: row.actionType as TaxComplianceUserActionType,
      sourceFingerprint: row.sourceFingerprint,
      note: row.note,
      metadata: row.metadata,
      revision: row.revision,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));

    // 4. Project deterministic timeline
    const rawTimeline = projectTaxComplianceTimeline({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources,
      annualState,
      userActions,
      generatedAt: `${today}T00:00:00.000Z`,
    });

    // 5. Apply filters if provided
    let filteredObligations = rawTimeline.obligations;
    if (input.status) {
      filteredObligations = filteredObligations.filter(
        (o) => o.status === (input.status as TaxComplianceObligationStatus),
      );
    }
    if (input.kind) {
      filteredObligations = filteredObligations.filter(
        (o) => o.kind === (input.kind as TaxComplianceObligationKind),
      );
    }
    if (input.period) {
      filteredObligations = filteredObligations.filter((o) => o.period === input.period);
    }

    if (
      filteredObligations.length === rawTimeline.obligations.length &&
      !input.status &&
      !input.kind &&
      !input.period
    ) {
      return rawTimeline;
    }

    return Object.freeze({
      ...rawTimeline,
      obligations: Object.freeze(filteredObligations),
    });
  }
}
