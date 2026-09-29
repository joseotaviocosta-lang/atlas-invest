import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import {
  ITaxObligationRepository,
  ITaxPaymentEvidenceRepository,
  IFederalTaxDeadlineRepository,
} from '@atlas/database';
import { materializeTaxObligation, parseFiscalCompetence } from '@atlas/tax-engine';
import {
  FEDERAL_TAX_DEADLINE_REPOSITORY,
  TAX_OBLIGATION_REPOSITORY,
  TAX_PAYMENT_EVIDENCE_REPOSITORY,
} from '../../database/tokens';
import { GetMonthlyTaxLiabilityUseCase } from './get-monthly-tax-liability.use-case';
import { toDomainDeadlineEntry } from './federal-tax-deadline-registry';
import { fingerprintLiability } from './tax-obligation-fingerprint';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { mapObligationToReadModel, type TaxObligationReadModel } from './tax-obligation.read-model';

/**
 * Phase 4C.2 — materializes the operational TaxObligation for a competence from
 * the canonical MonthlyTaxLiability (calculation truth) + the official direct
 * deadline registry (due-date authority). Idempotent; never recalculates tax
 * (ADR-264, ADR-267).
 */
@Injectable()
export class MaterializeTaxObligationUseCase {
  constructor(
    @Inject(GetMonthlyTaxLiabilityUseCase)
    private readonly getLiability: GetMonthlyTaxLiabilityUseCase,
    @Inject(FEDERAL_TAX_DEADLINE_REPOSITORY)
    private readonly deadlineRepository: IFederalTaxDeadlineRepository,
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(TAX_PAYMENT_EVIDENCE_REPOSITORY)
    private readonly paymentRepository: ITaxPaymentEvidenceRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(params: { userId: string; competence: string }): Promise<TaxObligationReadModel> {
    const competence = parseFiscalCompetence(params.competence);
    if (!competence) {
      throw new BadRequestException({
        message: `Invalid fiscal competence '${params.competence}'. Expected canonical 'YYYY-MM'`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }

    const liability = await this.getLiability.compute({
      userId: params.userId,
      competence: competence.value,
    });

    const deadlineRows = await this.deadlineRepository.listAll();
    const deadlineEntries = deadlineRows.map(toDomainDeadlineEntry);

    const now = this.clock.today();
    const inProgress = competence.value >= now.slice(0, 7);

    const plan = materializeTaxObligation({
      competence: competence.value,
      liability,
      deadlineEntries,
      now,
      inProgress,
    });

    const resolvedEntry = plan.deadlineEntryId
      ? (deadlineEntries.find((entry) => entry.id === plan.deadlineEntryId) ?? null)
      : null;

    const fingerprint = fingerprintLiability({
      taxSubjectId: params.userId,
      competence: competence.value,
      liability,
    });

    const provenance: Record<string, unknown> = {
      sourceStrategy: 'DIRECT_OFFICIAL_DEADLINE',
      materializedAt: now,
      liabilityFingerprint: fingerprint,
      engineVersion: liability.engineVersion,
      calculationVersion: liability.calculationVersion,
      ruleVersions: liability.ruleVersions,
      deadlineSource: resolvedEntry
        ? {
            entryId: resolvedEntry.id,
            dueDate: resolvedEntry.dueDate,
            version: resolvedEntry.version,
            sourceAuthority: resolvedEntry.sourceAuthority,
            sourceDocument: resolvedEntry.sourceDocument,
            sourceReference: resolvedEntry.sourceReference,
            sourcePublishedAt: resolvedEntry.sourcePublishedAt,
            verifiedAt: resolvedEntry.verifiedAt,
          }
        : null,
    };

    const { record } = await this.obligationRepository.materialize({
      taxSubjectId: params.userId,
      competence: competence.value,
      taxBucket: plan.bucket,
      revenueCode: plan.revenueCode,
      liabilityFingerprint: fingerprint,
      deadlineEntryId: plan.deadlineEntryId,
      principalAmount: plan.principalAmount,
      currency: plan.currency,
      dueDate: resolvedEntry ? new Date(`${resolvedEntry.dueDate}T00:00:00.000Z`) : null,
      status: plan.status,
      reasonCode: plan.reasonCode,
      darfReadiness: plan.darfReadiness,
      darfReadinessReason: plan.darfReadinessReason,
      dataQuality: plan.dataQuality,
      provenance,
    });

    const payments = await this.paymentRepository.listByObligation(record.id, params.userId);
    return mapObligationToReadModel(record, now, payments);
  }
}
