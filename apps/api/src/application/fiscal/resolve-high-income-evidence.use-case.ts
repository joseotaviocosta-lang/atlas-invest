import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  IHighIncomeEvidenceRepository,
  HighIncomeEvidenceRow,
  HighIncomeEvidenceWriteOutcome,
} from '@atlas/database';
import { HIGH_INCOME_EVIDENCE_REPOSITORY } from '../../database/tokens';

export interface ResolveHighIncomeEvidenceInput {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly decision: 'KEEP_EXISTING' | 'ACCEPT_NEW';
  readonly createdByPrincipal: string;
}

export interface ResolveHighIncomeEvidenceResult {
  readonly outcome: HighIncomeEvidenceWriteOutcome;
  readonly record: HighIncomeEvidenceRow;
}

@Injectable()
export class ResolveHighIncomeEvidenceUseCase {
  constructor(
    @Inject(HIGH_INCOME_EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: IHighIncomeEvidenceRepository,
  ) {}

  async execute(input: ResolveHighIncomeEvidenceInput): Promise<ResolveHighIncomeEvidenceResult> {
    if (input.decision !== 'KEEP_EXISTING' && input.decision !== 'ACCEPT_NEW') {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_EVIDENCE',
        message: 'Resolution decision must be KEEP_EXISTING or ACCEPT_NEW.',
      });
    }

    const current = await this.evidenceRepository.findById(input.id);
    if (
      !current ||
      current.taxSubjectId !== input.taxSubjectId ||
      current.calendarYear !== input.calendarYear
    ) {
      throw new NotFoundException({
        code: 'COMMON.NOT_FOUND',
        message: 'High-income evidence not found.',
      });
    }

    const latest = await this.evidenceRepository.findCurrent({
      taxSubjectId: input.taxSubjectId,
      calendarYear: current.calendarYear,
      payerKey: current.payerKey,
      evidenceType: current.evidenceType,
      profitPeriodExercise: current.profitPeriodExercise,
    });
    if (!latest || latest.id !== current.id) {
      throw new ConflictException({
        code: 'FISCAL.EVIDENCE_CONFLICT',
        message: 'Only the current evidence revision can be resolved.',
      });
    }
    if (latest.conflictStatus !== 'CONFLICT') {
      throw new ConflictException({
        code: 'FISCAL.EVIDENCE_CONFLICT',
        message: 'Evidence is not in conflict; nothing to resolve.',
      });
    }

    const { outcome, record } = await this.evidenceRepository.resolve({
      id: input.id,
      taxSubjectId: input.taxSubjectId,
      decision: input.decision,
      createdByPrincipal: input.createdByPrincipal,
    });
    return { outcome, record };
  }
}
