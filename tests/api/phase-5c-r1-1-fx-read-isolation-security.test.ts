import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UpdateFxDataUseCase } from '../../apps/api/src/application/fx/update-fx-data.use-case';
import { GetFxCoverageUseCase } from '../../apps/api/src/application/fx/get-fx-coverage.use-case';
import { PersistedFxDataProvider } from '../../apps/api/src/market-data/persisted-fx-data.provider';
import { IFxObservationRepository } from '../../packages/database/src/repositories/interfaces';
import { LocalDate } from '@atlas/domain';

describe('Phase 5C-R1.1 FX Read Isolation & Security Matrix', () => {
  const mockRepo: IFxObservationRepository = {
    findObservation: vi.fn(),
    findObservations: vi.fn(),
    findLatest: vi.fn(),
    upsertObservation: vi.fn(),
    upsertObservations: vi.fn(),
    getCoverage: vi.fn().mockResolvedValue({
      totalObservations: 10,
      firstObservationDate: LocalDate.from('2026-01-01'),
      lastObservationDate: LocalDate.from('2026-10-16'),
    }),
  };

  describe('Zero-Live-Read Invariant on Standard GET Endpoints (Gate 10 & Gate 11)', () => {
    it('PersistedFxDataProvider never calls globalThis.fetch on getRate / getRates', async () => {
      // Mock global fetch to throw error if ever called
      const originalFetch = globalThis.fetch;
      const failingFetch = vi.fn().mockRejectedValue(new Error('UPSTREAM_CALL_FORBIDDEN'));
      globalThis.fetch = failingFetch;

      try {
        const persistedProvider = new PersistedFxDataProvider(mockRepo);
        (mockRepo.findObservation as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'test-1',
          baseCurrency: 'USD',
          quoteCurrency: 'BRL',
          observationDate: LocalDate.from('2026-10-16'),
          rate: '5.20',
          rateType: 'MID',
          source: 'BCB_PTAX',
          providerSeriesId: '10813',
          firstFetchedAt: new Date(),
          lastFetchedAt: new Date(),
          fetchCount: 1,
          revisedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const rate = await persistedProvider.getRate('USD', 'BRL', LocalDate.from('2026-10-16'));
        expect(rate.rate.value).toBe('5.2');
        expect(rate.source).toBe('BCB_PTAX');
        // Upstream fetch was NOT called
        expect(failingFetch).not.toHaveBeenCalled();

        // Coverage query also never calls fetch
        const coverageUseCase = new GetFxCoverageUseCase(mockRepo);
        const cov = await coverageUseCase.execute('USD', 'BRL');
        expect(cov.totalObservations).toBe(10);
        expect(failingFetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Security & Input Validation Matrix (Gates 16, 17, 18, 19, 20, 21)', () => {
    const updateUseCase = new UpdateFxDataUseCase(mockRepo);

    it('Gate 16: Invalid base currency format/code fails with controlled error', async () => {
      await expect(
        updateUseCase.execute({
          baseCurrency: 'INVALID',
          quoteCurrency: 'BRL',
          from: '2026-01-01',
          to: '2026-01-10',
        }),
      ).rejects.toThrow();
    });

    it('Gate 17: Invalid quote currency format/code fails with controlled error', async () => {
      await expect(
        updateUseCase.execute({
          baseCurrency: 'USD',
          quoteCurrency: 'XYZ123',
          from: '2026-01-01',
          to: '2026-01-10',
        }),
      ).rejects.toThrow();
    });

    it('Gate 18: Same-currency ingestion (identity) is rejected with 400 Bad Request', async () => {
      await expect(
        updateUseCase.execute({
          baseCurrency: 'BRL',
          quoteCurrency: 'BRL',
          from: '2026-01-01',
          to: '2026-01-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Gate 19: Date validation fails when from > to', async () => {
      await expect(
        updateUseCase.execute({
          baseCurrency: 'USD',
          quoteCurrency: 'BRL',
          from: '2026-10-20',
          to: '2026-10-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Gate 20: Date validation fails when malformed date string provided', async () => {
      await expect(
        updateUseCase.execute({
          baseCurrency: 'USD',
          quoteCurrency: 'BRL',
          from: 'invalid-date',
          to: '2026-10-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Gate 21: Max historical range limit (5 years / 1825 days) is strictly enforced', async () => {
      await expect(
        updateUseCase.execute({
          baseCurrency: 'USD',
          quoteCurrency: 'BRL',
          from: '2015-01-01',
          to: '2026-01-01', // 11 years > 5 years
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
