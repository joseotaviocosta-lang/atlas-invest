import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  deriveTaxPaymentSupport,
  TaxPaymentSupport,
  TaxPaymentEvidenceRecord,
  TAX_PAYMENT_SUPPORT_DISCLAIMER,
} from '@atlas/tax-engine';
import { ITaxSettlementRepository } from '@atlas/database';
import { TAX_SETTLEMENT_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxComplianceTimelineUseCase } from './get-tax-compliance-timeline.use-case';
import { mapSettlementRowToEvidenceRecord } from './record-tax-payment-evidence.use-case';

export interface GetTaxPaymentSupportInput {
  readonly taxSubjectId: string;
  readonly obligationKey: string;
}

@Injectable()
export class GetTaxPaymentSupportUseCase {
  constructor(
    @Inject(GetTaxComplianceTimelineUseCase)
    private readonly timelineUseCase: GetTaxComplianceTimelineUseCase,
    @Inject(TAX_SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ITaxSettlementRepository,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(input: GetTaxPaymentSupportInput): Promise<TaxPaymentSupport> {
    // 1. Strict anti-enumeration check: obligationKey must start with authenticated taxSubjectId
    if (!input.obligationKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax obligation '${input.obligationKey}' was not found.`);
    }

    // 2. Parse period and calendarYear from canonical obligationKey (${taxSubjectId}:${period}:${kind}:${sourceRef})
    const parts = input.obligationKey.split(':');
    const period = parts[1] ?? '';
    const calendarYear = parseInt(period.slice(0, 4), 10);
    if (isNaN(calendarYear)) {
      throw new NotFoundException(
        `Invalid period format in obligationKey '${input.obligationKey}'.`,
      );
    }

    // 3. Retrieve authoritative compliance timeline for the calendar year
    const timeline = await this.timelineUseCase.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
    });

    const obligation = timeline.obligations.find((o) => o.obligationKey === input.obligationKey);
    if (!obligation) {
      throw new NotFoundException(`Tax obligation '${input.obligationKey}' was not found.`);
    }

    // 4. Retrieve payment evidence history from repository
    const rows = await this.settlementRepository.listHistory({
      taxSubjectId: input.taxSubjectId,
      obligationKey: input.obligationKey,
    });

    const evidenceHistory: TaxPaymentEvidenceRecord[] = rows.map(mapSettlementRowToEvidenceRecord);

    // 5. Derive payment support via pure engine
    const todayCivilDate = this.clock.today();
    const support = deriveTaxPaymentSupport({
      obligation,
      evidenceHistory,
      todayCivilDate,
    });

    if (!support) {
      // Non-payable obligation: return safe NOT_APPLICABLE read model.
      // Distinguish genuine no-tax months from calculated-but-not-payable ones,
      // and never fabricate a due date (e.g. today) that would read as an
      // official deadline downstream.
      const hasPositiveAmount =
        obligation.amount !== null &&
        obligation.amount !== '0' &&
        obligation.amount !== '0.00' &&
        !obligation.amount.startsWith('-');
      const notPayableYet = hasPositiveAmount && !obligation.dueDate;
      return {
        obligationKey: obligation.obligationKey,
        sourceFingerprint: obligation.sourceFingerprint,
        taxSubjectId: obligation.taxSubjectId,
        calendarYear: obligation.calendarYear,
        period: obligation.period,
        kind: obligation.kind,
        taxCategory: (obligation.metadata?.bucket as string | undefined) ?? 'VARIABLE_INCOME',
        revenueCode: (obligation.metadata?.revenueCode as string | undefined) ?? null,
        amount: obligation.amount ?? '0.00',
        currency: obligation.currency ?? 'BRL',
        dueDate: obligation.dueDate ?? '',
        supportStatus: 'NOT_APPLICABLE',
        reconciliationStatus: 'NO_EVIDENCE',
        paymentInstructions: notPayableYet
          ? [
              'O imposto foi apurado, mas a obrigação ainda não está pagável: a competência segue em apuração ou o vencimento oficial ainda não foi publicado.',
              'Nenhum DARF oficial é gerado pelo Atlas. Aguarde o fechamento da competência e a definição do vencimento oficial.',
            ]
          : [
              'Esta obrigação não requer pagamento de DARF (valor zerado ou isento).',
            ],
        sourceReferences: [
          { label: 'Chave Canônica', ref: obligation.obligationKey },
          { label: 'Módulo de Origem', ref: obligation.sourceModule },
          { label: 'Referência de Origem', ref: obligation.sourceRef },
        ],
        latestEvidence: null,
        isOverdue: false,
        disclaimer: TAX_PAYMENT_SUPPORT_DISCLAIMER,
        version: '4K.2',
      };
    }

    return support;
  }
}
