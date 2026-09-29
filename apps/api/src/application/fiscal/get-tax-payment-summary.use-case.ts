import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ITaxCarryForwardRepository,
  ITaxObligationRepository,
  ITaxPaymentAggregationRepository,
} from '@atlas/database';
import {
  buildCarryForwardEntry,
  buildDarfPaymentEligibility,
  buildTaxPaymentAggregation,
  nextFiscalCompetence,
  parseFiscalCompetence,
  resolveMinimumDarfRule,
  type DarfPaymentEligibility,
  type MinimumDarfRuleResolution,
} from '@atlas/tax-engine';
import {
  TAX_CARRY_FORWARD_REPOSITORY,
  TAX_OBLIGATION_REPOSITORY,
  TAX_PAYMENT_AGGREGATION_REPOSITORY,
} from '../../database/tokens';
import { hashCanonicalFingerprint } from './tax-obligation-fingerprint';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { MaterializeTaxObligationUseCase } from './materialize-tax-obligation.use-case';
import { PRODUCTION_MINIMUM_DARF_RULE_REGISTRY } from './minimum-darf-registry';
import {
  mapAggregationRowToReadModel,
  mapCarryForwardRowToReadModel,
  mapEligibilityToReadModel,
  type TaxPaymentSummaryReadModel,
} from './tax-payment-summary.read-model';
import { mapObligationToReadModel, type TaxObligationReadModel } from './tax-obligation.read-model';

const PAYABLE_STATUSES = new Set(['OPEN', 'DUE', 'OVERDUE']);
const BLOCKING_BASE_STATUSES = new Set([
  'BLOCKED',
  'PROVISIONAL',
  'RECONCILIATION_REQUIRED',
  'SUPERSEDED',
]);

/**
 * Phase 4E — computes the minimum-DARF payment eligibility and materializes the
 * carry-forward entries / payment aggregation for a competence. Never
 * recalculates tax: it consumes the 4C obligation (tax truth) and the official
 * deadline (due-date authority). Below-minimum amounts are never discarded and
 * never rewritten to zero (ADR-278/279/281).
 */
@Injectable()
export class GetTaxPaymentSummaryUseCase {
  constructor(
    @Inject(MaterializeTaxObligationUseCase)
    private readonly materializeObligation: MaterializeTaxObligationUseCase,
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(TAX_CARRY_FORWARD_REPOSITORY)
    private readonly carryForwardRepository: ITaxCarryForwardRepository,
    @Inject(TAX_PAYMENT_AGGREGATION_REPOSITORY)
    private readonly aggregationRepository: ITaxPaymentAggregationRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async forCompetence(params: {
    userId: string;
    competence: string;
  }): Promise<TaxPaymentSummaryReadModel> {
    const competence = parseFiscalCompetence(params.competence);
    if (!competence) {
      throw new NotFoundException({
        message: `Invalid fiscal competence '${params.competence}'`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }
    const obligation = await this.materializeObligation.execute({
      userId: params.userId,
      competence: competence.value,
    });
    return this.evaluate({ userId: params.userId, obligation });
  }

  async forObligation(params: {
    userId: string;
    obligationId: string;
  }): Promise<TaxPaymentSummaryReadModel> {
    const row = await this.obligationRepository.findById(params.obligationId, params.userId);
    if (!row) {
      throw new NotFoundException({
        message: `Tax obligation '${params.obligationId}' not found`,
        code: 'TAX_OBLIGATION.NOT_FOUND',
      });
    }
    const obligation = mapObligationToReadModel(row, this.clock.today());
    return this.evaluate({ userId: params.userId, obligation });
  }

  private async evaluate(params: {
    userId: string;
    obligation: TaxObligationReadModel;
  }): Promise<TaxPaymentSummaryReadModel> {
    const { userId, obligation } = params;
    const competence = obligation.competence;

    // Open carry-forward entries are always considered, even when the current
    // competence has no tax of its own (a carried amount can still become
    // payable at the last competence).
    const carryRows = obligation.revenueCode
      ? await this.carryForwardRepository.listOpenForCompetence(
          userId,
          obligation.revenueCode,
          competence,
        )
      : (await this.carryForwardRepository.listBySubject(userId)).filter(
          (row) =>
            row.status === 'OPEN' &&
            (row.targetCompetence === null || row.targetCompetence <= competence),
        );

    const revenueCode = obligation.revenueCode ?? carryRows[0]?.revenueCode ?? null;
    const currency = obligation.currency ?? carryRows[0]?.currency ?? 'BRL';

    const currentForEligibility: string | null =
      obligation.darfReadiness === 'READY' &&
      obligation.principalAmount !== null &&
      PAYABLE_STATUSES.has(obligation.status)
        ? obligation.principalAmount.amount
        : null;

    const currentBlocked =
      BLOCKING_BASE_STATUSES.has(obligation.baseStatus) ||
      (obligation.baseStatus === 'OPEN' && obligation.darfReadiness !== 'READY');

    if (revenueCode === null) {
      // Nothing to collect and nothing carried: no activity → NOT_REQUIRED.
      // Anything else (unsupported bucket, blocked liability) fails closed.
      const nothingDue = obligation.baseStatus === 'NO_PAYMENT_DUE' && carryRows.length === 0;
      const productionRule = PRODUCTION_MINIMUM_DARF_RULE_REGISTRY[0] ?? null;
      const emptyEligibility: DarfPaymentEligibility = buildDarfPaymentEligibility({
        revenueCode: productionRule?.revenueCodes[0] ?? '',
        targetCompetence: competence,
        currency: nothingDue ? (productionRule?.currency ?? 'BRL') : null,
        currentAmount: null,
        currentObligationId: null,
        currentBlocked: !nothingDue,
        carryForward: [],
        ruleResolution:
          nothingDue && productionRule
            ? { outcome: 'RESOLVED', rule: productionRule, reasonCode: null }
            : {
                outcome: 'MISSING_MINIMUM_RULE',
                rule: null,
                reasonCode: 'MISSING_MINIMUM_RULE',
              },
        dueDate: null,
      });
      return {
        competence,
        obligation,
        eligibility: mapEligibilityToReadModel({
          eligibility: emptyEligibility,
          rule: nothingDue ? productionRule : null,
          carryForwardEntries: [],
          dataQuality: obligation.dataQuality,
        }),
        aggregation: null,
        openCarryForwardEntries: [],
      };
    }

    const ruleResolution: MinimumDarfRuleResolution = resolveMinimumDarfRule({
      rules: PRODUCTION_MINIMUM_DARF_RULE_REGISTRY,
      revenueCode,
      asOf: obligation.dueDate ?? this.clock.today(),
    });

    const eligibility = buildDarfPaymentEligibility({
      revenueCode,
      targetCompetence: competence,
      currency,
      currentAmount: currentForEligibility,
      currentObligationId: obligation.id,
      currentBlocked,
      carryForward: carryRows.map((row) => ({
        id: row.id,
        sourceObligationId: row.sourceObligationId,
        sourceCompetence: row.sourceCompetence,
        revenueCode: row.revenueCode,
        currency: row.currency,
        amount: row.amount,
      })),
      ruleResolution,
      dueDate: obligation.dueDate,
    });

    // Deferral: materialize an immutable carry-forward entry for a below-minimum
    // current obligation. Never discarded, never zeroed (ADR-281).
    if (
      eligibility.status === 'CARRIED_FORWARD' &&
      currentForEligibility !== null &&
      ruleResolution.rule !== null &&
      !currentBlocked
    ) {
      const entry = buildCarryForwardEntry({
        id: randomUUID(),
        taxSubjectId: userId,
        sourceObligationId: obligation.id,
        sourceCompetence: competence,
        revenueCode,
        currency,
        amount: currentForEligibility,
        targetCompetence: nextFiscalCompetence(competence),
        rule: ruleResolution.rule,
        createdAt: this.clock.today(),
      });
      if (entry) {
        await this.carryForwardRepository.createEntry({
          taxSubjectId: userId,
          sourceObligationId: entry.sourceObligationId,
          sourceCompetence: entry.sourceCompetence,
          revenueCode: entry.revenueCode,
          currency: entry.currency,
          amount: entry.amount,
          targetCompetence: entry.targetCompetence,
          ruleId: entry.ruleId,
          ruleVersion: entry.ruleVersion,
          fingerprint: hashCanonicalFingerprint(entry.fingerprint),
        });
      }
    }

    // Aggregation: the collectible/deferrable payment unit (current + carry).
    let aggregationReadModel = null;
    if (eligibility.status === 'PAYABLE' || eligibility.status === 'CARRIED_FORWARD') {
      const aggregation = buildTaxPaymentAggregation({
        id: randomUUID(),
        taxSubjectId: userId,
        eligibility,
      });
      if (aggregation) {
        const { record } = await this.aggregationRepository.create({
          taxSubjectId: userId,
          revenueCode: aggregation.revenueCode,
          targetCompetence: aggregation.targetCompetence,
          currency: aggregation.currency,
          currentAmount: aggregation.currentAmount,
          carryForwardAmount: aggregation.carryForwardAmount,
          totalPayable: aggregation.totalPayable,
          minimumThreshold: aggregation.minimumThreshold,
          sourceEntryIds: aggregation.sourceEntryIds,
          currentObligationId: aggregation.currentObligationId,
          dueDate: obligation.dueDate ? new Date(`${obligation.dueDate}T00:00:00.000Z`) : null,
          status: aggregation.status,
          ruleId: aggregation.ruleId,
          ruleVersion: aggregation.ruleVersion,
          fingerprint: hashCanonicalFingerprint(aggregation.fingerprint),
        });
        aggregationReadModel = mapAggregationRowToReadModel(record);
      }
    }

    const refreshedCarryRows = await this.carryForwardRepository.listBySubject(userId, {
      revenueCode,
    });

    return {
      competence,
      obligation,
      eligibility: mapEligibilityToReadModel({
        eligibility,
        rule: ruleResolution.rule,
        carryForwardEntries: refreshedCarryRows,
        dataQuality: obligation.dataQuality,
      }),
      aggregation: aggregationReadModel,
      openCarryForwardEntries: refreshedCarryRows
        .filter((row) => row.status === 'OPEN')
        .map(mapCarryForwardRowToReadModel),
    };
  }
}
