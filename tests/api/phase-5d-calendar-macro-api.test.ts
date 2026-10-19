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
  });
});
