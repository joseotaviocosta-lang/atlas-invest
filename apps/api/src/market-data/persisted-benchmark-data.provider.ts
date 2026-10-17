import { Injectable, Inject } from '@nestjs/common';
import { LocalDate, Quantity } from '@atlas/domain';
import {
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
  BenchmarkObservation,
  RateBenchmarkObservation,
  BenchmarkId,
  RateUnit,
  assertValidBenchmarkId,
} from '@atlas/benchmark-engine';
import { IBenchmarkObservationRepository } from '@atlas/database';
import { BENCHMARK_OBSERVATION_REPOSITORY } from '../database/tokens';

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Persisted benchmark data provider for Phase 5B.
 *
 * Reads canonical index levels (IBOV) and daily rate series (CDI) strictly
 * from the persisted `benchmark_observations` database repository.
 *
 * Performs ZERO live external network calls on reads.
 */
@Injectable()
export class PersistedBenchmarkDataProvider
  implements BenchmarkDataProvider, RateBenchmarkDataProvider
{
  readonly provider = 'PERSISTED_DATABASE';
  private readonly maxLookbackDays: number;

  constructor(
    @Inject(BENCHMARK_OBSERVATION_REPOSITORY)
    private readonly repository: IBenchmarkObservationRepository,
    options: { maxLookbackDays?: number } = {},
  ) {
    this.maxLookbackDays = options.maxLookbackDays ?? 7;
  }

  async getObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<BenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);

    // 1. Exact date lookup first
    const exact = await this.repository.findObservation(benchmarkId, date);
    if (exact) {
      return Object.freeze({
        benchmarkId,
        date: exact.referenceDate,
        value: Quantity.from(exact.value),
        source: exact.source,
      });
    }

    // 2. Previous trading day within maxLookbackDays (for weekend / non-trading boundary resolution)
    let current = date;
    for (let i = 1; i <= this.maxLookbackDays; i++) {
      const prev = addDays(current, -1);
      const candidate = await this.repository.findObservation(benchmarkId, prev);
      if (candidate) {
        return Object.freeze({
          benchmarkId,
          date: candidate.referenceDate,
          value: Quantity.from(candidate.value),
          source: candidate.source,
        });
      }
      current = prev;
    }

    throw new Error(
      `Benchmark observation not found in database for ${benchmarkId} on ${date.toString()}`,
    );
  }

  async getObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservation[]> {
    assertValidBenchmarkId(benchmarkId);
    if (from.compare(to) > 0) throw new Error('Invalid range');

    const rows = await this.repository.findObservations(benchmarkId, from, to);
    return rows.map((r) =>
      Object.freeze({
        benchmarkId,
        date: r.referenceDate,
        value: Quantity.from(r.value),
        source: r.source,
      }),
    );
  }

  async getRateObservation(
    benchmarkId: BenchmarkId,
    date: LocalDate,
  ): Promise<RateBenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);

    const exact = await this.repository.findObservation(benchmarkId, date);
    if (exact) {
      return Object.freeze({
        benchmarkId,
        date: exact.referenceDate,
        rate: Quantity.from(exact.value),
        unit: exact.unit as RateUnit,
        source: exact.source,
      });
    }

    throw new Error(
      `Rate benchmark observation not found in database for ${benchmarkId} on ${date.toString()}`,
    );
  }

  async getRateObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<RateBenchmarkObservation[]> {
    assertValidBenchmarkId(benchmarkId);
    if (from.compare(to) > 0) throw new Error('Invalid range');

    const rows = await this.repository.findObservations(benchmarkId, from, to);
    return rows.map((r) =>
      Object.freeze({
        benchmarkId,
        date: r.referenceDate,
        rate: Quantity.from(r.value),
        unit: r.unit as RateUnit,
        source: r.source,
      }),
    );
  }
}
