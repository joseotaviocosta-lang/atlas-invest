import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import {
  BenchmarkId,
  BENCHMARK_DEFINITIONS,
  assertValidBenchmarkId,
  BenchmarkDataProvider,
  BenchmarkObservation,
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
      // IBOV / Price Index ingestion (Canonical Yahoo default, Stooq fallback)
      try {
        let indexProvider: BenchmarkDataProvider;
        if (providerOverride === 'IN_MEMORY') {
          indexProvider = new InMemoryBenchmarkDataProvider();
        } else if (providerOverride === 'STOOQ') {
          indexProvider = new StooqBenchmarkDataProvider();
        } else if (providerOverride === 'YAHOO') {
          indexProvider = new YahooBenchmarkDataProvider();
        } else if (
          process.env.NODE_ENV === 'test' &&
          process.env.BENCHMARK_DATA_PROVIDER === 'IN_MEMORY' &&
          !process.env.BENCHMARK_INGESTION_PROVIDER
        ) {
          indexProvider = new InMemoryBenchmarkDataProvider();
        } else {
          // Default canonical ingestion provider for IBOV is Yahoo
          indexProvider = new YahooBenchmarkDataProvider();
        }

        receipt.provider = indexProvider.provider;
        let observations: BenchmarkObservation[] = [];
        try {
          observations = await indexProvider.getObservations(benchmarkId, fromDate, toDate);
        } catch (fetchErr: unknown) {
          const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          receipt.providerErrors.push(
            `Primary provider (${indexProvider.provider}) failed: ${errMsg}`,
          );
          // If primary failed and no explicit override was forced, try fallback
          if (!providerOverride && indexProvider.provider !== 'IN_MEMORY') {
            const fallbackProvider =
              indexProvider.provider === 'YAHOO'
                ? new StooqBenchmarkDataProvider()
                : new YahooBenchmarkDataProvider();
            try {
              const fallbackObs = await fallbackProvider.getObservations(
                benchmarkId,
                fromDate,
                toDate,
              );
              if (fallbackObs.length > 0) {
                indexProvider = fallbackProvider;
                receipt.provider = fallbackProvider.provider;
                observations = fallbackObs;
              }
            } catch (fallbackErr: unknown) {
              const fallbackMsg =
                fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
              receipt.providerErrors.push(
                `Fallback provider (${fallbackProvider.provider}) failed: ${fallbackMsg}`,
              );
            }
          }
        }

        // If primary returned 0 observations without throwing, try fallback
        if (
          observations.length === 0 &&
          !providerOverride &&
          indexProvider.provider !== 'IN_MEMORY'
        ) {
          const fallbackProvider =
            indexProvider.provider === 'YAHOO'
              ? new StooqBenchmarkDataProvider()
              : new YahooBenchmarkDataProvider();
          try {
            const fallbackObs = await fallbackProvider.getObservations(
              benchmarkId,
              fromDate,
              toDate,
            );
            if (fallbackObs.length > 0) {
              indexProvider = fallbackProvider;
              receipt.provider = fallbackProvider.provider;
              observations = fallbackObs;
            }
          } catch (fallbackErr: unknown) {
            const fallbackMsg =
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            receipt.providerErrors.push(
              `Fallback provider (${fallbackProvider.provider}) failed: ${fallbackMsg}`,
            );
          }
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

    if (receipt.providerErrors.length > 0) {
      if (receipt.observationsInserted > 0 || receipt.observationsUnchanged > 0) {
        receipt.status = 'COMPLETED_WITH_WARNINGS';
      } else {
        receipt.status = 'FAILED';
      }
    }

    receipt.finishedAt = new Date().toISOString();
    return receipt;
  }
}
