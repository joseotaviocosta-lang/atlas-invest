import { Inject, Injectable } from '@nestjs/common';
import { binderFileStem, serializeBinderCsv, serializeBinderJson } from '@atlas/tax-engine';
import {
  GetPeriodCloseReadinessUseCase,
  type PeriodCloseSnapshotInput,
} from './get-period-close-readiness.use-case';

export interface ExportPeriodCloseBinderResult {
  readonly body: string;
  readonly filename: string;
  readonly contentType: string;
}

/**
 * Serializes the current evidence binder for professional handoff.
 * Support-only wording is baked into the binder sections; filenames carry
 * scope + period only (no PII, no traversal — validated upstream).
 */
@Injectable()
export class ExportPeriodCloseBinderUseCase {
  constructor(
    @Inject(GetPeriodCloseReadinessUseCase)
    private readonly readinessUseCase: GetPeriodCloseReadinessUseCase,
  ) {}

  async execute(
    input: PeriodCloseSnapshotInput & { format: 'json' | 'csv' },
  ): Promise<ExportPeriodCloseBinderResult> {
    const snapshot = await this.readinessUseCase.executeSnapshot(input);
    const { binder } = snapshot;
    const stem = binderFileStem(binder.scope, binder.period);
    if (input.format === 'json') {
      return Object.freeze({
        body: serializeBinderJson(binder),
        filename: `${stem}.json`,
        contentType: 'application/json; charset=utf-8',
      });
    }
    return Object.freeze({
      body: serializeBinderCsv(binder),
      filename: `${stem}.csv`,
      contentType: 'text/csv; charset=utf-8',
    });
  }
}
