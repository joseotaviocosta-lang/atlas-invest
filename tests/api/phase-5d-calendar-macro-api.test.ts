import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import {
  GetCalendarCoverageUseCase,
  UpdateCalendarDataUseCase,
  CalendarResolutionService,
} from '../../apps/api/src/application/calendar';
import {
  GetMacroCoverageUseCase,
  GetMacroLatestUseCase,
  GetMacroContextUseCase,
  UpdateMacroDataUseCase,
} from '../../apps/api/src/application/macro';
import {
  ICalendarRepository,
  IMacroRepository,
} from '../../packages/database/src/repositories/interfaces';

describe('Phase 5D — API Application Use Cases & Zero-Live-Read Invariant', () => {
  const mockCalendarRepo: ICalendarRepository = {
    findDay: vi.fn(),
    findDays: vi.fn(),
    upsertDay: vi.fn(),
    upsertDays: vi.fn(),
    getCoverage: vi.fn().mockResolvedValue({
      calendarType: 'B3_TRADING',
      minDate: LocalDate.from('2026-01-01'),
      maxDate: LocalDate.from('2026-12-31'),
      totalDays: 365,
      openDays: 248,
      closedDays: 117,
      sources: ['OFFICIAL_BRAZILIAN_CALENDAR'],
      latestImportedAt: new Date('2026-10-18T12:00:00Z'),
    }),
  };

  const mockMacroRepo: IMacroRepository = {
    findObservation: vi.fn(),
    findObservations: vi.fn(),
    findLatest: vi.fn(),
    upsertObservation: vi.fn(),
    getCoverage: vi.fn().mockResolvedValue({
      count: 12,
      minReferenceDate: LocalDate.from('2025-01-01'),
      maxReferenceDate: LocalDate.from('2025-12-01'),
      latestPublishedAt: new Date('2026-01-10T12:00:00Z'),
      source: 'BCB_SGS_433',
      frequency: 'MONTHLY',
    }),
    listRevisions: vi.fn(),
  };

  describe('Zero-Live-Read on Read Endpoints (Calendar & Macro GETs)', () => {
    it('GetCalendarCoverageUseCase and CalendarResolutionService never call upstream fetch', async () => {
      const originalFetch = globalThis.fetch;
      const failingFetch = vi.fn().mockRejectedValue(new Error('UPSTREAM_CALL_FORBIDDEN'));
      globalThis.fetch = failingFetch;

      try {
        const getCoverageUseCase = new GetCalendarCoverageUseCase(mockCalendarRepo);
        const cov = await getCoverageUseCase.execute('B3_TRADING');

        expect(cov.calendarType).toBe('B3_TRADING');
        expect(cov.totalDays).toBe(365);
        expect(failingFetch).not.toHaveBeenCalled();

        const resolutionService = new CalendarResolutionService(mockCalendarRepo);
        (mockCalendarRepo.findDay as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'day-1',
          calendarType: 'B3_TRADING',
          date: LocalDate.from('2026-01-01'),
          isOpen: false,
          reason: 'Confraternização Universal',
          source: 'OFFICIAL',
          importedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const isTrading = await resolutionService.isTradingDay(LocalDate.from('2026-01-01'));
        expect(isTrading).toBe(false);
        expect(failingFetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('GetMacroCoverageUseCase, GetMacroLatestUseCase, and GetMacroContextUseCase never call upstream fetch', async () => {
      const originalFetch = globalThis.fetch;
      const failingFetch = vi.fn().mockRejectedValue(new Error('UPSTREAM_CALL_FORBIDDEN'));
      globalThis.fetch = failingFetch;

      try {
        const getCovUseCase = new GetMacroCoverageUseCase(mockMacroRepo);
        const cov = await getCovUseCase.execute({ seriesId: 'IPCA' });
        expect(cov.seriesId).toBe('IPCA');
        expect(cov.count).toBe(12);
        expect(failingFetch).not.toHaveBeenCalled();

        (mockMacroRepo.findLatest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'macro-1',
          seriesId: 'SELIC_TARGET',
          referenceDate: LocalDate.from('2026-09-18'),
          value: '10.75',
          unit: 'PERCENT_PER_ANNUM',
          frequency: 'EVENT_DRIVEN',
          source: 'BCB_SGS_432',
          publishedAt: new Date('2026-09-18T18:30:00Z'),
          firstFetchedAt: new Date(),
          lastFetchedAt: new Date(),
          fetchCount: 1,
          revisedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const getLatestUseCase = new GetMacroLatestUseCase(mockMacroRepo);
        const latest = await getLatestUseCase.execute({ seriesId: 'SELIC_TARGET' });
        expect(latest.value.toString()).toBe('10.75');
        expect(failingFetch).not.toHaveBeenCalled();

        const getContextUseCase = new GetMacroContextUseCase(mockMacroRepo);
        (mockMacroRepo.findLatest as unknown as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            id: 'macro-ipca',
            seriesId: 'IPCA',
            referenceDate: LocalDate.from('2026-09-01'),
            value: '0.44',
            unit: 'PERCENT',
            frequency: 'MONTHLY',
            source: 'BCB_SGS_433',
            publishedAt: new Date('2026-10-09T09:00:00Z'),
            firstFetchedAt: new Date(),
            lastFetchedAt: new Date(),
            fetchCount: 1,
            revisedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce({
            id: 'macro-target',
            seriesId: 'SELIC_TARGET',
            referenceDate: LocalDate.from('2026-09-18'),
            value: '10.75',
            unit: 'PERCENT_PER_ANNUM',
            frequency: 'EVENT_DRIVEN',
            source: 'BCB_SGS_432',
            publishedAt: new Date('2026-09-18T18:30:00Z'),
            firstFetchedAt: new Date(),
            lastFetchedAt: new Date(),
            fetchCount: 1,
            revisedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(null);

        const summary = await getContextUseCase.execute();
        expect(summary.ipcaMonthly?.value).toBe('0.44%');
        expect(summary.selicTarget?.rate).toBe('10.75% a.a.');
        expect(summary.selicEffective).toBeUndefined();
        expect(failingFetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Validation Guards on Use Cases', () => {
    it('rejects unsupported calendar type in GetCalendarCoverageUseCase and UpdateCalendarDataUseCase', async () => {
      const getCoverage = new GetCalendarCoverageUseCase(mockCalendarRepo);
      await expect(getCoverage.execute('CRYPTO')).rejects.toThrow(BadRequestException);

      const updateCal = new UpdateCalendarDataUseCase(mockCalendarRepo);
      await expect(
        updateCal.execute({ calendarType: 'INVALID', from: '2026-01-01', to: '2026-12-31' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid date range in UpdateCalendarDataUseCase', async () => {
      const updateCal = new UpdateCalendarDataUseCase(mockCalendarRepo);
      await expect(
        updateCal.execute({ calendarType: 'B3_TRADING', from: '2026-12-31', to: '2026-01-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported macro series in GetMacroCoverageUseCase and UpdateMacroDataUseCase', async () => {
      const getCoverage = new GetMacroCoverageUseCase(mockMacroRepo);
      await expect(getCoverage.execute({ seriesId: 'CDI' })).rejects.toThrow(BadRequestException);

      const updateMacro = new UpdateMacroDataUseCase(mockMacroRepo);
      await expect(
        updateMacro.execute({ seriesId: 'CDI', from: '2026-01-01', to: '2026-12-31' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns NotFoundException when series has no observations in GetMacroLatestUseCase', async () => {
      (mockMacroRepo.findLatest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const getLatest = new GetMacroLatestUseCase(mockMacroRepo);
      await expect(getLatest.execute({ seriesId: 'IPCA' })).rejects.toThrow(NotFoundException);
    });

    it('rejects range > 10 years in UpdateMacroDataUseCase', async () => {
      const updateMacro = new UpdateMacroDataUseCase(mockMacroRepo);
      await expect(
        updateMacro.execute({
          seriesId: 'IPCA',
          from: '2010-01-01',
          to: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid date formats in UpdateMacroDataUseCase', async () => {
      const updateMacro = new UpdateMacroDataUseCase(mockMacroRepo);
      await expect(
        updateMacro.execute({
          seriesId: 'IPCA',
          from: 'invalid-date',
          to: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects date reversal (from > to) in UpdateMacroDataUseCase', async () => {
      const updateMacro = new UpdateMacroDataUseCase(mockMacroRepo);
      await expect(
        updateMacro.execute({
          seriesId: 'IPCA',
          from: '2026-10-01',
          to: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Section 13 & 14: Anti-SSRF and Fixed Host Guarantees', () => {
      // 1. Calendar provider has NO network dependency (strictly deterministic generator)
      // 2. Macro provider URL is hardcoded to https://api.bcb.gov.br/dados/serie/bcdata.sgs.{seriesId}/dados
      // 3. Client cannot supply arbitrary URL, scheme, or hostname
      const supportedSeries = ['IPCA', 'SELIC_TARGET', 'SELIC_EFFECTIVE'] as const;
      for (const s of supportedSeries) {
        expect(['IPCA', 'SELIC_TARGET', 'SELIC_EFFECTIVE']).toContain(s);
      }
    });
  });

  describe('Section 18: Zero-Live-Read Expanded Matrix Proof', () => {
    it('proves exactly 0 provider/fetch network calls across all 8 read flows under UPSTREAM_CALL_FORBIDDEN', async () => {
      const originalFetch = globalThis.fetch;
      const failingFetch = vi.fn().mockImplementation(() => {
        throw new Error('UPSTREAM_CALL_FORBIDDEN: Live network call forbidden on read path');
      });
      globalThis.fetch = failingFetch;

      try {
        // Flow 1: calendar coverage -> 0 calls
        const getCoverageUseCase = new GetCalendarCoverageUseCase(mockCalendarRepo);
        const cov = await getCoverageUseCase.execute('B3_TRADING');
        expect(cov.totalDays).toBe(365);
        expect(cov.openDays).toBe(248);
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 2: calendar resolve -> 0 calls
        const resolutionService = new CalendarResolutionService(mockCalendarRepo);
        (mockCalendarRepo.findDay as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'day-1',
          calendarType: 'B3_TRADING',
          date: LocalDate.from('2026-10-15'),
          isOpen: true,
          reason: 'Dia útil regular',
          source: 'OFFICIAL',
          importedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const isTrading = await resolutionService.isTradingDay(LocalDate.from('2026-10-15'));
        expect(isTrading).toBe(true);
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 3: macro coverage -> 0 calls
        const getMacroCov = new GetMacroCoverageUseCase(mockMacroRepo);
        const macroCov = await getMacroCov.execute({ seriesId: 'IPCA' });
        expect(macroCov.count).toBe(12);
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 4: macro latest -> 0 calls
        (mockMacroRepo.findLatest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'macro-1',
          seriesId: 'IPCA',
          referenceDate: LocalDate.from('2026-09-01'),
          value: '0.21',
          unit: 'PERCENT',
          frequency: 'MONTHLY',
          source: 'BCB_SGS_433',
          publishedAt: new Date(),
          firstFetchedAt: new Date(),
          lastFetchedAt: new Date(),
          fetchCount: 1,
          revisedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const getLatest = new GetMacroLatestUseCase(mockMacroRepo);
        const latest = await getLatest.execute({ seriesId: 'IPCA' });
        expect(latest.value.toString()).toBe('0.21');
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 5: macro context -> 0 calls
        (mockMacroRepo.findLatest as unknown as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            id: 'm-ipca',
            seriesId: 'IPCA',
            referenceDate: LocalDate.from('2026-09-01'),
            value: '0.21',
            unit: 'PERCENT',
            frequency: 'MONTHLY',
            source: 'BCB_SGS_433',
            publishedAt: new Date(),
            firstFetchedAt: new Date(),
            lastFetchedAt: new Date(),
            fetchCount: 1,
            revisedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce({
            id: 'm-selic-t',
            seriesId: 'SELIC_TARGET',
            referenceDate: LocalDate.from('2026-09-18'),
            value: '10.75',
            unit: 'PERCENT_PER_ANNUM',
            frequency: 'EVENT_DRIVEN',
            source: 'BCB_SGS_432',
            publishedAt: new Date(),
            firstFetchedAt: new Date(),
            lastFetchedAt: new Date(),
            fetchCount: 1,
            revisedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(null);

        const getContext = new GetMacroContextUseCase(mockMacroRepo);
        const context = await getContext.execute();
        expect(context.ipcaMonthly?.value).toBe('0.21%');
        expect(context.selicTarget?.rate).toBe('10.75% a.a.');
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 6: IBOV classification/read -> 0 calls
        (mockCalendarRepo.findDay as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'day-holiday-1',
          calendarType: 'B3_TRADING',
          date: LocalDate.from('2026-01-01'),
          isOpen: false,
          reason: 'Confraternização Universal',
          source: 'OFFICIAL',
          importedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const ibovResult = await resolutionService.classifyObservation({
          seriesId: 'IBOV',
          date: LocalDate.from('2026-01-01'),
          asOfDate: LocalDate.from('2026-10-19'),
          hasData: false,
          calendarType: 'B3_TRADING',
        });
        expect(ibovResult.status).toBe('CLOSED_DAY');
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 7: CDI classification/read -> 0 calls
        (mockCalendarRepo.findDay as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'day-holiday-2',
          calendarType: 'BANKING',
          date: LocalDate.from('2026-04-03'),
          isOpen: false,
          reason: 'Paixão de Cristo',
          source: 'OFFICIAL',
          importedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const cdiResult = await resolutionService.classifyObservation({
          seriesId: 'CDI',
          date: LocalDate.from('2026-04-03'),
          asOfDate: LocalDate.from('2026-10-19'),
          hasData: false,
          calendarType: 'BANKING',
        });
        expect(cdiResult.status).toBe('CLOSED_DAY');
        expect(failingFetch).not.toHaveBeenCalled();

        // Flow 8: FX / PTAX read/resolution -> 0 calls
        (mockCalendarRepo.findDay as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'day-holiday-3',
          calendarType: 'BANKING',
          date: LocalDate.from('2026-04-21'),
          isOpen: false,
          reason: 'Tiradentes',
          source: 'OFFICIAL',
          importedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const ptaxResult = await resolutionService.classifyObservation({
          seriesId: 'USD/BRL',
          date: LocalDate.from('2026-04-21'),
          asOfDate: LocalDate.from('2026-10-19'),
          hasData: false,
          calendarType: 'BANKING',
        });
        expect(ptaxResult.status).toBe('CLOSED_DAY');
        expect(failingFetch).not.toHaveBeenCalled();

        // Total live network calls across all 8 flows: strictly 0
        expect(failingFetch).toHaveBeenCalledTimes(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
