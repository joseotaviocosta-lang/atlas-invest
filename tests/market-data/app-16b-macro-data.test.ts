import { describe, it, expect, vi } from 'vitest';
import { LocalDate, Quantity } from '@atlas/domain';
import {
  BcbMacroDataProvider,
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

describe('PROJECT ATLAS — APP-16B: Macro Data Completeness (Backend & Providers)', () => {
  describe('1. BcbMacroDataProvider — Series Parsing & Contract', () => {
    it('fetches and parses PTAX (SGS 10813) with BRL_PER_USD unit and DAILY frequency', async () => {
      const mockJson = [
        { data: '05/11/2026', valor: '5.4615' },
        { data: '06/11/2026', valor: '5.5007' },
      ];

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockJson), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const provider = new BcbMacroDataProvider({ fetchFn: mockFetch as never });
      const observations = await provider.getLatestObservations('PTAX', 2);

      expect(observations.length).toBe(2);
      expect(observations[1]?.seriesId).toBe('PTAX');
      expect(observations[1]?.referenceDate.toString()).toBe('2026-11-06');
      expect(observations[1]?.value.toString()).toBe('5.5007');
      expect(observations[1]?.unit).toBe('BRL_PER_USD');
      expect(observations[1]?.frequency).toBe('DAILY');
      expect(observations[1]?.source).toBe('BCB_SGS_10813');
    });

    it('fetches and parses Selic Target (SGS 432), Selic Effective (SGS 1178), and IPCA (SGS 433)', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('432')) {
          return new Response(JSON.stringify([{ data: '09/12/2026', valor: '13.75' }]), { status: 200 });
        }
        if (url.includes('1178')) {
          return new Response(JSON.stringify([{ data: '06/11/2026', valor: '13.65' }]), { status: 200 });
        }
        if (url.includes('433')) {
          return new Response(JSON.stringify([{ data: '01/09/2026', valor: '0.82' }]), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      });

      const provider = new BcbMacroDataProvider({ fetchFn: mockFetch as never });

      const selicTarget = await provider.getLatestObservations('SELIC_TARGET', 1);
      expect(selicTarget[0]?.value.toString()).toBe('13.75');
      expect(selicTarget[0]?.unit).toBe('PERCENT_PER_ANNUM');
      expect(selicTarget[0]?.source).toBe('BCB_SGS_432');

      const selicEffective = await provider.getLatestObservations('SELIC_EFFECTIVE', 1);
      expect(selicEffective[0]?.value.toString()).toBe('13.65');
      expect(selicEffective[0]?.unit).toBe('PERCENT_PER_ANNUM');
      expect(selicEffective[0]?.source).toBe('BCB_SGS_1178');

      const ipca = await provider.getLatestObservations('IPCA', 1);
      expect(ipca[0]?.value.toString()).toBe('0.82');
      expect(ipca[0]?.unit).toBe('PERCENT');
      expect(ipca[0]?.source).toBe('BCB_SGS_433');
    });

    it('retries on HTTP 429 / 5xx with backoff and throws controlled error on permanent failure without returning zero', async () => {
      let callCount = 0;
      const failingFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return new Response('Rate limited', { status: 429 });
        }
        return new Response(JSON.stringify([{ data: '06/11/2026', valor: '5.5007' }]), { status: 200 });
      });

      const provider = new BcbMacroDataProvider({ fetchFn: failingFetch as never, timeoutMs: 2000 });
      const observations = await provider.getLatestObservations('PTAX', 1);

      expect(callCount).toBe(3);
      expect(observations.length).toBe(1);
      expect(observations[0]?.value.toString()).toBe('5.5007');
    });

    it('never converts provider failure into zero', async () => {
      const failingFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const provider = new BcbMacroDataProvider({ fetchFn: failingFetch as never, timeoutMs: 500 });

      await expect(provider.getLatestObservations('PTAX', 1)).rejects.toThrow(
        /BCB SGS macro provider unavailable/,
      );
    });
  });

  describe('2. evaluateMacroFreshness — Business Day & Event-Driven Rules', () => {
    it('classifies Selic Target as FRESH within 60 days and STALE after 60 days', () => {
      const meetingDate = LocalDate.from('2026-10-01');
      expect(evaluateMacroFreshness('SELIC_TARGET', meetingDate, LocalDate.from('2026-11-15'))).toBe('FRESH');
      expect(evaluateMacroFreshness('SELIC_TARGET', meetingDate, LocalDate.from('2026-12-15'))).toBe('STALE');
    });

    it('classifies Daily Series (Selic Effective & PTAX) as FRESH on weekends/Monday following Friday publication', () => {
      const fridayObs = LocalDate.from('2026-11-06'); // Friday
      // Saturday (+1 day)
      expect(evaluateMacroFreshness('PTAX', fridayObs, LocalDate.from('2026-11-07'))).toBe('FRESH');
      // Sunday (+2 days)
      expect(evaluateMacroFreshness('SELIC_EFFECTIVE', fridayObs, LocalDate.from('2026-11-08'))).toBe('FRESH');
      // Monday (+3 days)
      expect(evaluateMacroFreshness('PTAX', fridayObs, LocalDate.from('2026-11-09'))).toBe('FRESH');
      // 5 days later without publication is STALE
      expect(evaluateMacroFreshness('PTAX', fridayObs, LocalDate.from('2026-11-12'))).toBe('STALE');
    });

    it('classifies Monthly IPCA as FRESH within 65 calendar days', () => {
      const ipcaObs = LocalDate.from('2026-09-01'); // Ref: Sept 2026
      expect(evaluateMacroFreshness('IPCA', ipcaObs, LocalDate.from('2026-10-15'))).toBe('FRESH');
      expect(evaluateMacroFreshness('IPCA', ipcaObs, LocalDate.from('2026-11-05'))).toBe('FRESH');
      expect(evaluateMacroFreshness('IPCA', ipcaObs, LocalDate.from('2026-11-20'))).toBe('STALE');
    });
  });

  describe('3. SyncMacroDataUseCase — Idempotent Persistence & Partial Fault Tolerance', () => {
    class InMemoryMacroRepository implements Partial<IMacroRepository> {
      public store = new Map<string, MacroObservationRecordRow>();

      async upsertObservation(input: MacroObservationUpsertInput): Promise<{
        outcome: MacroObservationUpsertOutcome;
        observation: MacroObservationRecordRow;
      }> {
        const key = `${input.seriesId}:${input.referenceDate.toString()}:${input.source}`;
        const existing = this.store.get(key);

        if (!existing) {
          const row: MacroObservationRecordRow = {
            id: `obs-${Math.random()}`,
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
          this.store.set(key, row);
          return { outcome: 'INSERTED', observation: row };
        }

        if (existing.value === input.value) {
          existing.fetchCount += 1;
          existing.lastFetchedAt = new Date();
          return { outcome: 'UNCHANGED', observation: existing };
        }

        existing.value = input.value;
        existing.revisedAt = new Date();
        return { outcome: 'REVISED', observation: existing };
      }

      async findLatest(seriesId: string): Promise<MacroObservationRecordRow | null> {
        const matching = Array.from(this.store.values()).filter((o) => o.seriesId === seriesId);
        if (matching.length === 0) return null;
        matching.sort((a, b) => b.referenceDate.compare(a.referenceDate));
        return matching[0] ?? null;
      }
    }

    it('performs initial sync and handles repeated execution idempotently', async () => {
      const repo = new InMemoryMacroRepository();
      const mockProvider: IMacroDataProvider = {
        async getObservation() { throw new Error('Not used'); },
        async getObservations() { return []; },
        async getLatestObservations(seriesId: string) {
          return [
            {
              seriesId: seriesId as never,
              referenceDate: LocalDate.from('2026-11-06'),
              value: Quantity.from(seriesId === 'PTAX' ? '5.5007' : '13.65'),
              unit: seriesId === 'PTAX' ? 'BRL_PER_USD' : 'PERCENT_PER_ANNUM',
              frequency: 'DAILY',
              source: `BCB_SGS_${seriesId}`,
            },
          ];
        },
      };

      const syncUseCase = new SyncMacroDataUseCase(repo as never);

      // Run 1: initial insert
      const receipt1 = await syncUseCase.execute(mockProvider);
      expect(receipt1.overallStatus).toBe('SUCCESS');
      expect(receipt1.indicators.PTAX?.inserted).toBe(1);
      expect(receipt1.indicators.SELIC_EFFECTIVE?.inserted).toBe(1);
      expect(repo.store.size).toBe(5);

      // Run 2: duplicate sync must be UNCHANGED (idempotent, no duplicates)
      const receipt2 = await syncUseCase.execute(mockProvider);
      expect(receipt2.overallStatus).toBe('SUCCESS');
      expect(receipt2.indicators.PTAX?.inserted).toBe(0);
      expect(receipt2.indicators.PTAX?.unchanged).toBe(1);
      expect(repo.store.size).toBe(5); // size did not grow!
    });

    it('tolerates partial provider failure without aborting remaining indicators', async () => {
      const repo = new InMemoryMacroRepository();
      const mockProvider: IMacroDataProvider = {
        async getObservation() { throw new Error('Not used'); },
        async getObservations() { return []; },
        async getLatestObservations(seriesId: string) {
          if (seriesId === 'PTAX') {
            throw new Error('PTAX service upstream 503');
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
      expect(receipt.indicators.PTAX?.status).toBe('ERROR');
      expect(receipt.indicators.PTAX?.error).toContain('PTAX service upstream 503');
      expect(receipt.indicators.SELIC_TARGET?.status).toBe('SUCCESS');
      expect(receipt.indicators.SELIC_EFFECTIVE?.status).toBe('SUCCESS');
      expect(receipt.indicators.IPCA?.status).toBe('SUCCESS');
    });
  });

  describe('4. GetMacroContextUseCase — Context Presentation & Honest States', () => {
    it('returns formatted macro context with human-friendly sources and official B3 gap status', async () => {
      const mockRepo: Partial<IMacroRepository> = {
        async findLatest(seriesId: string) {
          if (seriesId === 'SELIC_TARGET') {
            return {
              id: '1',
              seriesId: 'SELIC_TARGET',
              referenceDate: LocalDate.from('2026-09-18'),
              value: '13.75',
              unit: 'PERCENT_PER_ANNUM',
              frequency: 'EVENT_DRIVEN',
              source: 'BCB_SGS_432',
              publishedAt: null,
              firstFetchedAt: new Date(),
              lastFetchedAt: new Date(),
              fetchCount: 1,
              revisedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          if (seriesId === 'PTAX') {
            return {
              id: '2',
              seriesId: 'PTAX',
              referenceDate: LocalDate.from('2026-11-06'),
              value: '5.5007',
              unit: 'BRL_PER_USD',
              frequency: 'DAILY',
              source: 'BCB_SGS_10813',
              publishedAt: null,
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

      // Selic target formatted
      expect(context.selicTarget?.rate).toBe('13.75% a.a.');
      expect(context.selicTarget?.formattedValue).toBe('13,75% a.a.');
      expect(context.selicTarget?.effectiveDateFormatted).toBe('18/09/2026');
      expect(context.selicTarget?.source).toBe('Banco Central / Copom');
      expect(context.selicTarget?.status).toBe('AVAILABLE');

      // PTAX formatted
      expect(context.ptax?.rate).toBe('R$ 5,5007');
      expect(context.ptax?.effectiveDateFormatted).toBe('06/11/2026');
      expect(context.ptax?.source).toBe('Banco Central (PTAX)');
      expect(context.ptax?.convention).toBe('Venda (Fechamento PTAX)');
      expect(context.ptax?.status).toBe('AVAILABLE');

      // Unpopulated series
      expect(context.ipcaMonthly).toBeUndefined();

      // IBOVESPA honest official gap
      expect(context.ibovespa?.value).toBe('—');
      expect(context.ibovespa?.status).toBe('OFFICIAL_SOURCE_UNAVAILABLE');
      expect(context.ibovespa?.message).toBe('Integração ainda não disponível');
    });
  });
});
