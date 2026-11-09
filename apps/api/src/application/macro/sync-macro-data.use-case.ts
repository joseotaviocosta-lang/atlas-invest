import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  MacroSeriesId,
  BcbMacroDataProvider,
  IMacroDataProvider,
} from '@atlas/market-data';
import { IMacroRepository } from '@atlas/database';
import { MACRO_REPOSITORY } from '../../database/tokens';

export interface MacroIndicatorSyncResult {
  status: 'SUCCESS' | 'NO_DATA' | 'ERROR';
  fetched: number;
  inserted: number;
  unchanged: number;
  revised: number;
  error?: string;
  durationMs: number;
}

export interface SyncMacroDataReceipt {
  timestamp: string;
  overallStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  indicators: Record<string, MacroIndicatorSyncResult>;
}

@Injectable()
export class SyncMacroDataUseCase {
  private readonly logger = new Logger(SyncMacroDataUseCase.name);

  constructor(
    @Inject(MACRO_REPOSITORY)
    private readonly macroRepository: IMacroRepository,
  ) {}

  async execute(providerOverride?: IMacroDataProvider): Promise<SyncMacroDataReceipt> {
    const provider: IMacroDataProvider =
      providerOverride ?? new BcbMacroDataProvider({ timeoutMs: 15000 });

    const seriesToSync: MacroSeriesId[] = [
      'SELIC_TARGET',
      'SELIC_EFFECTIVE',
      'IPCA',
      'PTAX',
    ];

    const results: Record<string, MacroIndicatorSyncResult> = {};
    let successCount = 0;
    let failureCount = 0;

    for (const seriesId of seriesToSync) {
      const startTime = Date.now();
      try {
        let observations;
        if (typeof provider.getLatestObservations === 'function') {
          observations = await provider.getLatestObservations(seriesId, 10);
        } else {
          // Fallback to last 90 days range if getLatestObservations is not implemented
          const today = new Date();
          const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
          const from = {
            year: ninetyDaysAgo.getUTCFullYear(),
            month: ninetyDaysAgo.getUTCMonth() + 1,
            day: ninetyDaysAgo.getUTCDate(),
            compare: () => -1,
            toString: () => '',
          };
          const to = {
            year: today.getUTCFullYear(),
            month: today.getUTCMonth() + 1,
            day: today.getUTCDate(),
            compare: () => 1,
            toString: () => '',
          };
          observations = await provider.getObservations(seriesId, from as never, to as never);
        }

        let inserted = 0;
        let unchanged = 0;
        let revised = 0;

        for (const obs of observations) {
          const outcome = await this.macroRepository.upsertObservation({
            seriesId: obs.seriesId,
            referenceDate: obs.referenceDate,
            value: obs.value.toString(),
            unit: obs.unit,
            frequency: obs.frequency,
            source: obs.source,
            publishedAt: obs.publishedAt,
          });

          if (outcome.outcome === 'INSERTED') inserted++;
          else if (outcome.outcome === 'UNCHANGED') unchanged++;
          else if (outcome.outcome === 'REVISED') revised++;
        }

        const durationMs = Date.now() - startTime;
        const status: 'SUCCESS' | 'NO_DATA' = observations.length > 0 ? 'SUCCESS' : 'NO_DATA';

        results[seriesId] = {
          status,
          fetched: observations.length,
          inserted,
          unchanged,
          revised,
          durationMs,
        };

        if (status === 'SUCCESS') successCount++;

        this.logger.log(
          `[MacroSync] Indicator: ${seriesId} | Status: ${status} | Fetched: ${observations.length} | Inserted: ${inserted} | Unchanged: ${unchanged} | Duration: ${durationMs}ms`,
        );
      } catch (err) {
        const durationMs = Date.now() - startTime;
        failureCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);

        results[seriesId] = {
          status: 'ERROR',
          fetched: 0,
          inserted: 0,
          unchanged: 0,
          revised: 0,
          error: errorMessage,
          durationMs,
        };

        this.logger.warn(
          `[MacroSync] Indicator: ${seriesId} | Status: ERROR | Error: ${errorMessage} | Duration: ${durationMs}ms`,
        );
      }
    }

    const overallStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' =
      failureCount === 0
        ? 'SUCCESS'
        : successCount > 0
          ? 'PARTIAL'
          : 'FAILED';

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      indicators: results,
    };
  }
}
