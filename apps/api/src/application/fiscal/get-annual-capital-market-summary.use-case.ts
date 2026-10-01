import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ITaxObligationRepository } from '@atlas/database';
import {
  buildAnnualCapitalMarketSummary,
  createCalendarYear,
  isValidCalendarYear,
  MonthlyFiscalInputData,
} from '@atlas/tax-engine';
import { TAX_OBLIGATION_REPOSITORY } from '../../database/tokens';
import { GetMonthlyTaxLiabilityUseCase } from './get-monthly-tax-liability.use-case';
import {
  AnnualCapitalMarketFiscalSummaryReadModel,
  mapAnnualCapitalMarketSummaryToReadModel,
} from './annual-capital-market-summary.read-model';

export interface GetAnnualCapitalMarketSummaryQuery {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
}

@Injectable()
export class GetAnnualCapitalMarketSummaryUseCase {
  constructor(
    @Inject(GetMonthlyTaxLiabilityUseCase)
    private readonly getMonthlyTaxLiabilityUseCase: GetMonthlyTaxLiabilityUseCase,
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
  ) {}

  async execute(
    query: GetAnnualCapitalMarketSummaryQuery,
  ): Promise<AnnualCapitalMarketFiscalSummaryReadModel> {
    if (!isValidCalendarYear(query.calendarYear)) {
      throw new BadRequestException(
        `Invalid calendar year: ${query.calendarYear}. Must be an integer between 1900 and 2100.`,
      );
    }

    const calendarYear = createCalendarYear(query.calendarYear);
    const monthsData: MonthlyFiscalInputData[] = [];

    // Load obligations for this tax subject
    const obligations = await this.obligationRepository.list(query.taxSubjectId);
    const obligationByCompetence = new Map<string, (typeof obligations)[0]>();
    for (const ob of obligations) {
      if (!obligationByCompetence.has(ob.competence)) {
        obligationByCompetence.set(ob.competence, ob);
      }
    }

    for (let m = 1; m <= 12; m++) {
      const mm = m.toString().padStart(2, '0');
      const competence = `${query.calendarYear}-${mm}`;

      try {
        const monthlyResult = await this.getMonthlyTaxLiabilityUseCase.execute({
          userId: query.taxSubjectId,
          competence,
        });

        const equity = monthlyResult.equity;
        const fiiCategory = monthlyResult.categories.find(
          (c) => c.category === 'REAL_ESTATE_FUND' || c.category === 'FII',
        );

        const ob = obligationByCompetence.get(competence);

        monthsData.push({
          competence,
          normalEquities: {
            grossSaleAmount: equity?.normal?.grossSales ?? '0.00',
            isExempt: equity?.normal ? equity.normal.exemptionStatus === 'EXEMPT' : true,
            profitOrLoss: equity?.normal?.currentResult ?? '0.00',
            lossCompensated: equity?.normal?.lossConsumed ?? '0.00',
            taxableBase: equity?.normal?.taxableBaseBeforeRate ?? '0.00',
            irrfDeducted: equity?.normal?.irrfUsed ?? '0.00',
            taxDue: equity?.normal?.netTaxBefore6015Aggregation ?? '0.00',
          },
          dayTrade: {
            grossSaleAmount: equity?.dayTrade?.grossSales ?? '0.00',
            profitOrLoss: equity?.dayTrade?.currentResult ?? '0.00',
            lossCompensated: equity?.dayTrade?.lossConsumed ?? '0.00',
            taxableBase: equity?.dayTrade?.taxableBaseBeforeRate ?? '0.00',
            irrfDeducted: equity?.dayTrade?.irrfUsed ?? '0.00',
            taxDue: equity?.dayTrade?.netTaxBefore6015Aggregation ?? '0.00',
          },
          fii: {
            grossSaleAmount: fiiCategory?.grossSales?.amount ?? '0.00',
            profitOrLoss: fiiCategory?.realizedResult?.amount ?? '0.00',
            lossCompensated: fiiCategory?.lossApplied?.amount ?? '0.00',
            taxableBase: fiiCategory?.taxableBaseAfterLosses?.amount ?? '0.00',
            irrfDeducted: fiiCategory?.withholdingApplied?.amount ?? '0.00',
            taxDue: fiiCategory?.taxDue?.amount ?? '0.00',
          },
          darf6015: {
            obligationId: ob?.id ?? null,
            status: ob?.status ?? 'EXEMPT',
            principalAmount: ob?.principalAmount ?? '0.00',
            paidAmount: ob?.status === 'PAID' ? (ob?.principalAmount ?? '0.00') : '0.00',
          },
          qualityIssues: monthlyResult.limitations,
        });
      } catch {
        // If empty month or not computable, record zero snapshot
        monthsData.push({
          competence,
        });
      }
    }

    const summary = buildAnnualCapitalMarketSummary({
      calendarYear,
      taxSubjectId: query.taxSubjectId,
      months: monthsData,
    });

    return mapAnnualCapitalMarketSummaryToReadModel(summary);
  }
}
