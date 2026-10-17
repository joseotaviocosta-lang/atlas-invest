import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import {
  BenchmarkId,
  BENCHMARK_DEFINITIONS,
  assertValidBenchmarkId,
  StooqBenchmarkDataProvider,
  YahooBenchmarkDataProvider,
  BcbRateBenchmarkDataProvider,
  InMemoryBenchmarkDataProvider,
  InMemoryRateBenchmarkDataProvider,
} from '@atlas/benchmark-engine';
import { IBenchmarkObservationRepository } from '@atlas/database';
import { BENCHMARK_OBSERVATION_REPOSITORY } from '../../database/tokens';

export interface BenchmarkIngestionReceipt {
  benchmarkId: BenchmarkId;
  provider: string;
  from: string;
  to: string;
  observationsFetched: number;
  observationsInserted: number;
  observationsUnchanged: number;
  observationsRevised: number;
  providerErrors: string[];
  startedAt: string;
  finishedAt: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
}

export interface UpdateBenchmarkDataParams {
  benchmarkId: string;
  from: string;
  to: string;
  providerOverride?: 'STOOQ' | 'YAHOO' | 'BCB' | 'IN_MEMORY';
}

@Injectable()
export class UpdateBenchmarkDataUseCase {
  constructor(
    @Inject(BENCHMARK_OBSERVATION_REPOSITORY)
    private readonly repository: IBenchmarkObservationRepository,
  ) {}

  async execute(params: UpdateBenchmarkDataParams): Promise<BenchmarkIngestionReceipt> {
    const startedAt = new Date().toISOString();
    const benchmarkId = assertValidBenchmarkId(params.benchmarkId);
    const def = BENCHMARK_DEFINITIONS[benchmarkId];

    let fromDate: LocalDate;
    let toDate: LocalDate;
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

    const da = Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day);
    const db = Date.UTC(toDate.year, toDate.month - 1, toDate.day);
    const days = Math.round((db - da) / (1000 * 60 * 60 * 24));
    if (days > 365 * 5) {
      throw new BadRequestException({
        message: `Date range exceeds maximum allowed limit of 5 years (requested ${days} days)`,
        code: 'VALIDATION.RANGE_TOO_LARGE',
      });
    }

    const providerOverride =
      params.providerOverride ?? (process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : undefined);

    const receipt: BenchmarkIngestionReceipt = {
      benchmarkId,
      provider: providerOverride ?? (def.type === 'RATE_SERIES' ? 'BCB' : 'STOOQ'),
      from: fromDate.toString(),
      to: toDate.toString(),
      observationsFetched: 0,
      observationsInserted: 0,
      observationsUnchanged: 0,
      observationsRevised: 0,
      providerErrors: [],
      startedAt,
      finishedAt: '',
      status: 'COMPLETED',
    };

    if (def.type === 'RATE_SERIES') {
      // CDI / Rate Series ingestion (Default BCB SGS 12)
      try {
        const rateProvider =
          providerOverride === 'IN_MEMORY'
            ? new InMemoryRateBenchmarkDataProvider()
            : new BcbRateBenchmarkDataProvider();

        receipt.provider = rateProvider.provider;
        const observations = await rateProvider.getRateObservations(benchmarkId, fromDate, toDate);
        receipt.observationsFetched = observations.length;

        for (const obs of observations) {
          const res = await this.repository.upsertObservation({
            benchmarkId,
            referenceDate: obs.date,
            value: obs.rate.value,
            unit: obs.unit,
            frequency: 'DAILY_BUSINESS_DAYS',
            source: obs.source,
          });

          if (res.outcome === 'INSERTED') receipt.observationsInserted++;
          else if (res.outcome === 'UNCHANGED') receipt.observationsUnchanged++;
          else if (res.outcome === 'REVISED') receipt.observationsRevised++;
        }
      } catch (err: unknown) {
        receipt.providerErrors.push(err instanceof Error ? err.message : String(err));
        receipt.status = 'FAILED';
      }
    } else {
      // IBOV / Price Index ingestion (Default STOOQ / Yahoo fallback)
      try {
        let indexProvider =
          providerOverride === 'IN_MEMORY'
            ? new InMemoryBenchmarkDataProvider()
            : providerOverride === 'YAHOO'
              ? new YahooBenchmarkDataProvider()
              : new StooqBenchmarkDataProvider();

        receipt.provider = indexProvider.provider;
        let observations = await indexProvider.getObservations(benchmarkId, fromDate, toDate);

        // Fallback to Yahoo if Stooq yields 0 in non-test and no explicit provider override
        if (observations.length === 0 && !providerOverride) {
          indexProvider = new YahooBenchmarkDataProvider();
          receipt.provider = indexProvider.provider;
          observations = await indexProvider.getObservations(benchmarkId, fromDate, toDate);
        }

        receipt.observationsFetched = observations.length;

        for (const obs of observations) {
          const res = await this.repository.upsertObservation({
            benchmarkId,
            referenceDate: obs.date,
            value: obs.value.value,
            unit: 'INDEX_POINTS',
            frequency: 'DAILY_BUSINESS_DAYS',
            source: obs.source,
          });

          if (res.outcome === 'INSERTED') receipt.observationsInserted++;
          else if (res.outcome === 'UNCHANGED') receipt.observationsUnchanged++;
          else if (res.outcome === 'REVISED') receipt.observationsRevised++;
        }
      } catch (err: unknown) {
        receipt.providerErrors.push(err instanceof Error ? err.message : String(err));
        receipt.status = 'FAILED';
      }
    }

    if (receipt.providerErrors.length > 0 && receipt.observationsInserted > 0) {
      receipt.status = 'COMPLETED_WITH_WARNINGS';
    }

    receipt.finishedAt = new Date().toISOString();
    return receipt;
  }
}
