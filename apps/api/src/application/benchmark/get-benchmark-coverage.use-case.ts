import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import {
  BenchmarkId,
  assertValidBenchmarkId,
  BENCHMARK_DEFINITIONS,
} from '@atlas/benchmark-engine';
import { IBenchmarkObservationRepository } from '@atlas/database';
import { BENCHMARK_OBSERVATION_REPOSITORY } from '../../database/tokens';

export interface BenchmarkCoverageReadModel {
  benchmarkId: BenchmarkId;
  name: string;
  type: string;
  unit: string;
  totalObservations: number;
  firstObservationDate: string | null;
  lastObservationDate: string | null;
  queriedFrom?: string;
  queriedTo?: string;
  observationsInQueryRange?: number;
}

@Injectable()
export class GetBenchmarkCoverageUseCase {
  constructor(
    @Inject(BENCHMARK_OBSERVATION_REPOSITORY)
    private readonly repository: IBenchmarkObservationRepository,
  ) {}

  async execute(params: {
    benchmarkId: string;
    from?: string;
    to?: string;
  }): Promise<BenchmarkCoverageReadModel> {
    const benchmarkId = assertValidBenchmarkId(params.benchmarkId);
    const def = BENCHMARK_DEFINITIONS[benchmarkId];

    let fromDate: LocalDate | undefined;
    let toDate: LocalDate | undefined;

    if (params.from && params.to) {
      try {
        fromDate = LocalDate.from(params.from);
        toDate = LocalDate.from(params.to);
      } catch {
        throw new BadRequestException({
          message: `Invalid date format in range '${params.from}' to '${params.to}'. Expected YYYY-MM-DD.`,
          code: 'VALIDATION.INVALID_DATE_FORMAT',
        });
      }
      if (fromDate.compare(toDate) > 0) {
        throw new BadRequestException({
          message: `Invalid date range: 'from' (${params.from}) cannot be after 'to' (${params.to})`,
          code: 'VALIDATION.INVALID_DATE_RANGE',
        });
      }
    }

    const coverage = await this.repository.getCoverage(benchmarkId);

    let observationsInQueryRange: number | undefined;
    if (fromDate && toDate) {
      const rows = await this.repository.findObservations(benchmarkId, fromDate, toDate);
      observationsInQueryRange = rows.length;
    }

    return {
      benchmarkId,
      name: def.name,
      type: def.type,
      unit: def.type === 'RATE_SERIES' ? 'DAILY_PERCENT' : 'INDEX_POINTS',
      totalObservations: coverage.totalObservations,
      firstObservationDate: coverage.firstObservationDate
        ? coverage.firstObservationDate.toString()
        : null,
      lastObservationDate: coverage.lastObservationDate
        ? coverage.lastObservationDate.toString()
        : null,
      queriedFrom: params.from,
      queriedTo: params.to,
      observationsInQueryRange,
    };
  }
}
