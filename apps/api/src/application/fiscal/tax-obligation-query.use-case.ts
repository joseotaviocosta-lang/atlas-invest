import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITaxObligationRepository, ITaxPaymentEvidenceRepository } from '@atlas/database';
import { TAX_OBLIGATION_REPOSITORY, TAX_PAYMENT_EVIDENCE_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { mapObligationToReadModel, type TaxObligationReadModel } from './tax-obligation.read-model';

/** Reads a single persisted tax obligation (anti-enumeration 404). */
@Injectable()
export class GetTaxObligationUseCase {
  constructor(
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(TAX_PAYMENT_EVIDENCE_REPOSITORY)
    private readonly paymentRepository: ITaxPaymentEvidenceRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(params: { userId: string; id: string }): Promise<TaxObligationReadModel> {
    const row = await this.obligationRepository.findById(params.id, params.userId);
    if (!row) {
      throw new NotFoundException({
        message: `Tax obligation '${params.id}' not found`,
        code: 'TAX_OBLIGATION.NOT_FOUND',
      });
    }
    const payments = await this.paymentRepository.listByObligation(row.id, params.userId);
    return mapObligationToReadModel(row, this.clock.today(), payments);
  }
}

/** Lists persisted tax obligations for the authenticated tax subject. */
@Injectable()
export class ListTaxObligationsUseCase {
  constructor(
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(params: {
    userId: string;
    competence?: string;
    status?: string;
    bucket?: string;
  }): Promise<TaxObligationReadModel[]> {
    const rows = await this.obligationRepository.list(params.userId, {
      ...(params.competence ? { competence: params.competence } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.bucket ? { bucket: params.bucket } : {}),
    });
    const now = this.clock.today();
    return rows.map((row) => mapObligationToReadModel(row, now));
  }
}
