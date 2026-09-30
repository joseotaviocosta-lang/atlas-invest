import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ITaxCompensationElectionRepository } from '@atlas/database';
import {
  TAX_COMPENSATION_ELECTION_VALUES,
  parseFiscalCompetence,
  type TaxCompensationElectionValue,
} from '@atlas/tax-engine';
import { TAX_COMPENSATION_ELECTION_REPOSITORY } from '../../database/tokens';
import {
  EQUITY_EXEMPT_LOSS_ELECTION_TYPE,
  mapTaxCompensationElectionToReadModel,
  type TaxCompensationElectionReadModel,
} from './tax-compensation-election.read-model';

function invalidCompetence(competence: string): never {
  throw new BadRequestException({
    message: `Invalid fiscal competence '${competence}'. Expected canonical 'YYYY-MM'`,
    code: 'FISCAL.INVALID_COMPETENCE',
  });
}

/**
 * Phase 4G.2A.1b — reads the current persisted compensation election for the
 * authenticated tax subject. The subject is derived exclusively from the
 * authenticated principal; no client-supplied taxSubjectId is accepted
 * (ADR-238 anti-enumeration).
 */
@Injectable()
export class GetTaxCompensationElectionUseCase {
  constructor(
    @Inject(TAX_COMPENSATION_ELECTION_REPOSITORY)
    private readonly repository: ITaxCompensationElectionRepository,
  ) {}

  async execute(params: {
    userId: string;
    competence: string;
  }): Promise<TaxCompensationElectionReadModel> {
    const parsed = parseFiscalCompetence(params.competence);
    if (!parsed) invalidCompetence(params.competence);

    const current = await this.repository.findCurrent({
      taxSubjectId: params.userId,
      competence: parsed.value,
      electionType: EQUITY_EXEMPT_LOSS_ELECTION_TYPE,
    });
    return mapTaxCompensationElectionToReadModel(parsed.value, current);
  }
}

/**
 * Phase 4G.2A.1b — writes a compensation-election revision. Same value is
 * idempotent (no new revision); a changed value creates a new immutable
 * revision. The subject is the authenticated principal only.
 */
@Injectable()
export class PutTaxCompensationElectionUseCase {
  constructor(
    @Inject(TAX_COMPENSATION_ELECTION_REPOSITORY)
    private readonly repository: ITaxCompensationElectionRepository,
  ) {}

  async execute(params: {
    userId: string;
    competence: string;
    value: string;
  }): Promise<{ created: boolean; election: TaxCompensationElectionReadModel }> {
    const parsed = parseFiscalCompetence(params.competence);
    if (!parsed) invalidCompetence(params.competence);

    if (!(TAX_COMPENSATION_ELECTION_VALUES as readonly string[]).includes(params.value)) {
      throw new BadRequestException({
        message: `Invalid election value '${params.value}'.`,
        code: 'FISCAL.INVALID_ELECTION_VALUE',
      });
    }

    const { outcome, record } = await this.repository.putRevision({
      taxSubjectId: params.userId,
      competence: parsed.value,
      electionType: EQUITY_EXEMPT_LOSS_ELECTION_TYPE,
      value: params.value as TaxCompensationElectionValue,
      source: 'MANUAL_CONFIRMED',
    });

    return {
      created: outcome === 'CREATED',
      election: mapTaxCompensationElectionToReadModel(parsed.value, record),
    };
  }
}
