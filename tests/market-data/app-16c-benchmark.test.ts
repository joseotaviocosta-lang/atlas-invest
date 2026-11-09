import { describe, it, expect, vi } from 'vitest';
import { LocalDate, Quantity } from '@atlas/domain';
import {
  BrapiMacroBenchmarkProvider,
  evaluateMacroFreshness,
  MacroObservation,
  IMacroDataProvider,
} from '@atlas/market-data';
import { SyncMacroDataUseCase } from '../../apps/api/src/application/macro/sync-macro-data.use-case';
import { GetMacroContextUseCase } from '../../apps/api/src/application/macro/get-macro-context.use-case';
import {
  IMacroRepository,
  MacroObservationRecordRow,
  MacroObservationUpsertInput,
  MacroObservationUpsertOutcome,
} from '@atlas/database';

describe('PROJECT ATLAS — APP-16C: Benchmark Data Source Completion (Ibovespa ^BVSP)', () => {
  describe('1. BrapiMacroBenchmarkProvider — Parsing & Contract', () => {
    it('fetches and parses Ibovespa (^BVSP) with INDEX_POINTS unit and DAILY frequency', async () => {
      const mockJson = {
        results: [
          {
            symbol: '^BVSP',
            shortName: 'IBOVESPA',
            longName: 'IBOVESPA',
            currency: 'BRL',
            regularMarketPrice: 168498.45,
            regularMarketTime: '2026-11-09T12:18:03.000Z',
            historicalDataPrice: [
              {
                date: 1793761200, // 2026-11-04
                close: 167564,
                adjustedClose: 167564,
              },
              {
                date: 1793847600, // 2026-11-05
                close: 166192,
                adjustedClose: 166192,
              },
            ],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockJson), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const provider = new BrapiMacroBenchmarkProvider({
        token: 'test-token',
        fetchFn: mockFetch as never,
      });

      const observations = await provider.getLatestObservations('IBOVESPA', 5);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders.Authorization).toBe('Bearer test-token');

      // Includes historical plus regularMarketTime (deduped by date)
      expect(observations.length).toBeGreaterThanOrEqual(2);
      const latest = observations[observations.length - 1];
      expect(latest?.seriesId).toBe('IBOVESPA');
      expect(latest?.referenceDate.toString()).toBe('2026-11-09');
      expect(latest?.value.toString()).toBe('168498.45');
      expect(latest?.unit).toBe('INDEX_POINTS');
      expect(latest?.frequency).toBe('DAILY');
      expect(latest?.source).toBe('BRAPI');
    });

    it('rejects unsupported series in BrapiMacroBenchmarkProvider', async () => {
      const provider = new BrapiMacroBenchmarkProvider();
      await expect(provider.getLatestObservations('PTAX' as never, 1)).rejects.toThrow(
        /only supports IBOVESPA series/,
      );
    });

    it('retries on HTTP 429/5xx and throws controlled error without returning zero', async () => {
      let attempts = 0;
      const failingFetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) {
          return new Response('Rate limited', { status: 429 });
        }
        return new Response(
          JSON.stringify({
            results: [
              {
                symbol: '^BVSP',
                regularMarketPrice: 168498.45,
                regularMarketTime: '2026-11-09T12:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        );
      });

      const provider = new BrapiMacroBenchmarkProvider({
        fetchFn: failingFetch as never,
        timeoutMs: 2000,
      });
      const observations = await provider.getLatestObservations('IBOVESPA', 1);

      expect(attempts).toBe(3);
      expect(observations.length).toBe(1);
      expect(observations[0]?.value.toString()).toBe('168498.45');
    });

    it('never converts provider failure into zero', async () => {
      const failingFetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));
      const provider = new BrapiMacroBenchmarkProvider({
        fetchFn: failingFetch as never,
        timeoutMs: 500,
      });

      await expect(provider.getLatestObservations('IBOVESPA', 1)).rejects.toThrow(
        /BRAPI benchmark provider unavailable/,
      );
    });
  });

  describe('2. evaluateMacroFreshness for IBOVESPA', () => {
    it('evaluates IBOVESPA within 4 calendar days as FRESH (accommodates weekends and holidays)', () => {
      const asOf = LocalDate.from('2026-11-09'); // Monday
      const friday = LocalDate.from('2026-11-06'); // 3 days diff
      expect(evaluateMacroFreshness('IBOVESPA', friday, asOf)).toBe('FRESH');

      const thursday = LocalDate.from('2026-11-05'); // 4 days diff
      expect(evaluateMacroFreshness('IBOVESPA', thursday, asOf)).toBe('FRESH');
    });

    it('evaluates IBOVESPA older than 4 calendar days as STALE', () => {
      const asOf = LocalDate.from('2026-11-09');
      const oldDate = LocalDate.from('2026-11-04'); // 5 days diff
      expect(evaluateMacroFreshness('IBOVESPA', oldDate, asOf)).toBe('STALE');
    });
  });

  describe('3. SyncMacroDataUseCase with IBOVESPA', () => {
    class InMemoryMacroRepository implements IMacroRepository {
      readonly store = new Map<string, MacroObservationRecordRow>();

      async findLatest(seriesId: string): Promise<MacroObservationRecordRow | null> {
        const matches = Array.from(this.store.values()).filter((r) => r.seriesId === seriesId);
        matches.sort((a, b) => b.referenceDate.compare(a.referenceDate));
        return matches[0] ?? null;
      }

      async upsertObservation(input: MacroObservationUpsertInput): Promise<{
        outcome: MacroObservationUpsertOutcome;
        observation: MacroObservationRecordRow;
      }> {
        const key = `${input.seriesId}:${input.referenceDate.toString()}:${input.source}`;
        const existing = this.store.get(key);
        if (existing) {
          if (existing.value === input.value) {
            existing.fetchCount += 1;
            existing.lastFetchedAt = new Date();
            return { outcome: 'UNCHANGED', observation: existing };
          }
          existing.value = input.value;
          existing.lastFetchedAt = new Date();
          return { outcome: 'REVISED', observation: existing };
        }

        const newRow: MacroObservationRecordRow = {
          id: `id-${key}`,
          seriesId: input.seriesId,
          referenceDate: input.referenceDate,
          value: input.value,
          unit: input.unit,
          frequency: input.frequency,
          source: input.source,
          publishedAt: input.publishedAt ?? null,
          firstFetchedAt: new Date(),
          lastFetchedAt: new Date(),
          fetchCount: 1,
          revisedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.store.set(key, newRow);
        return { outcome: 'INSERTED', observation: newRow };
      }

      findObservations(): Promise<MacroObservationRecordRow[]> { throw new Error('Not used'); }
      getCoverage(): Promise<any[]> { throw new Error('Not used'); }
    }

    it('synchronizes all 5 series including IBOVESPA with idempotency', async () => {
      const repo = new InMemoryMacroRepository();
      const mockProvider: IMacroDataProvider = {
        async getObservation() { throw new Error('Not used'); },
        async getObservations() { return []; },
        async getLatestObservations(seriesId: string) {
          if (seriesId === 'IBOVESPA') {
            return [
              {
                seriesId: 'IBOVESPA',
                referenceDate: LocalDate.from('2026-11-09'),
                value: Quantity.from('168498.45'),
                unit: 'INDEX_POINTS',
                frequency: 'DAILY',
                source: 'BRAPI',
              },
            ];
          }
          return [
            {
              seriesId: seriesId as never,
              referenceDate: LocalDate.from('2026-11-06'),
              value: Quantity.from('10.00'),
              unit: 'PERCENT',
              frequency: 'DAILY',
              source: 'BCB_SGS',
            },
          ];
        },
      };

      const syncUseCase = new SyncMacroDataUseCase(repo as never);

      // Run 1: initial insert of 5 indicators
      const receipt1 = await syncUseCase.execute(mockProvider);
      expect(receipt1.overallStatus).toBe('SUCCESS');
      expect(receipt1.indicators.IBOVESPA?.inserted).toBe(1);
      expect(receipt1.indicators.IBOVESPA?.status).toBe('SUCCESS');
      expect(repo.store.size).toBe(5);

      // Run 2: idempotent second run
      const receipt2 = await syncUseCase.execute(mockProvider);
      expect(receipt2.overallStatus).toBe('SUCCESS');
      expect(receipt2.indicators.IBOVESPA?.inserted).toBe(0);
      expect(receipt2.indicators.IBOVESPA?.unchanged).toBe(1);
      expect(repo.store.size).toBe(5);
    });

    it('tolerates BRAPI benchmark failure without breaking BCB indicators', async () => {
      const repo = new InMemoryMacroRepository();
      const mockProvider: IMacroDataProvider = {
        async getObservation() { throw new Error('Not used'); },
        async getObservations() { return []; },
        async getLatestObservations(seriesId: string) {
          if (seriesId === 'IBOVESPA') {
            throw new Error('BRAPI token expired or 401');
          }
          return [
            {
              seriesId: seriesId as never,
              referenceDate: LocalDate.from('2026-11-06'),
              value: Quantity.from('13.65'),
              unit: 'PERCENT_PER_ANNUM',
              frequency: 'DAILY',
              source: 'BCB_SGS',
            },
          ];
        },
      };

      const syncUseCase = new SyncMacroDataUseCase(repo as never);
      const receipt = await syncUseCase.execute(mockProvider);

      expect(receipt.overallStatus).toBe('PARTIAL');
      expect(receipt.indicators.IBOVESPA?.status).toBe('ERROR');
      expect(receipt.indicators.IBOVESPA?.error).toContain('BRAPI token expired');
      expect(receipt.indicators.SELIC_TARGET?.status).toBe('SUCCESS');
      expect(receipt.indicators.PTAX?.status).toBe('SUCCESS');
    });
  });

  describe('4. GetMacroContextUseCase with IBOVESPA', () => {
    it('returns formatted Ibovespa with points, reference date, and BRAPI source when available', async () => {
      const mockRepo: Partial<IMacroRepository> = {
        async findLatest(seriesId: string) {
          if (seriesId === 'IBOVESPA') {
            return {
              id: 'ibov-1',
              seriesId: 'IBOVESPA',
              referenceDate: LocalDate.from('2026-11-09'),
              value: '168498.45',
              unit: 'INDEX_POINTS',
              frequency: 'DAILY',
              source: 'BRAPI',
              publishedAt: new Date('2026-11-09T12:00:00Z'),
              firstFetchedAt: new Date(),
              lastFetchedAt: new Date(),
              fetchCount: 1,
              revisedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return null;
        },
      };

      const contextUseCase = new GetMacroContextUseCase(mockRepo as never);
      const context = await contextUseCase.execute();

      expect(context.ibovespa).toBeDefined();
      expect(context.ibovespa?.status).toBe('AVAILABLE');
      expect(context.ibovespa?.value).toBe('168.498 pts');
      expect(context.ibovespa?.formattedValue).toBe('168.498 pts');
      expect(context.ibovespa?.points).toBe('168498.45');
      expect(context.ibovespa?.referenceDate).toBe('2026-11-09');
      expect(context.ibovespa?.referenceDateFormatted).toBe('09/11/2026');
      expect(context.ibovespa?.source).toBe('BRAPI');
      expect(context.ibovespa?.message).toBe('Fechamento 09/11/2026 • BRAPI');
    });

    it('falls back honestly to OFFICIAL_SOURCE_UNAVAILABLE when IBOVESPA is not populated', async () => {
      const mockRepo: Partial<IMacroRepository> = {
        async findLatest() {
          return null;
        },
      };

      const contextUseCase = new GetMacroContextUseCase(mockRepo as never);
      const context = await contextUseCase.execute();

      expect(context.ibovespa?.value).toBe('—');
      expect(context.ibovespa?.status).toBe('OFFICIAL_SOURCE_UNAVAILABLE');
      expect(context.ibovespa?.message).toBe('Integração ainda não disponível');
    });

    it('maintains last-known-good offline when network is unavailable', async () => {
      // Database has last known good from previous successful sync
      const mockRepo: Partial<IMacroRepository> = {
        async findLatest(seriesId: string) {
          if (seriesId === 'IBOVESPA') {
            return {
              id: 'ibov-lkg',
              seriesId: 'IBOVESPA',
              referenceDate: LocalDate.from('2026-11-06'), // Friday
              value: '166192',
              unit: 'INDEX_POINTS',
              frequency: 'DAILY',
              source: 'BRAPI',
              publishedAt: new Date('2026-11-06T20:00:00Z'),
              firstFetchedAt: new Date(),
              lastFetchedAt: new Date(),
              fetchCount: 2,
              revisedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return null;
        },
      };

      const contextUseCase = new GetMacroContextUseCase(mockRepo as never);
      const context = await contextUseCase.execute();

      // Offline query against local repository succeeds without network
      expect(context.ibovespa?.status).toBe('AVAILABLE');
      expect(context.ibovespa?.value).toBe('166.192 pts');
      expect(context.ibovespa?.referenceDateFormatted).toBe('06/11/2026');
      expect(context.ibovespa?.source).toBe('BRAPI');
    });
  });
});
