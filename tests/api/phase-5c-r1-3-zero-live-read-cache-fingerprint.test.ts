import { describe, it, expect, vi } from 'vitest';
import { PersistedFxDataProvider } from '../../apps/api/src/market-data/persisted-fx-data.provider';
import { GetFxCoverageUseCase } from '../../apps/api/src/application/fx/get-fx-coverage.use-case';
import { UpdateFxDataUseCase } from '../../apps/api/src/application/fx/update-fx-data.use-case';
import { IFxObservationRepository } from '../../packages/database/src/repositories/interfaces';
import { LocalDate } from '@atlas/domain';

describe('Phase 5C-R1.3: Zero-Live-Read & Same-Currency Ingestion Policy', () => {
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

  it('Gate 10, 11 & 12: Zero-Live-Read Hard Failure test on Home, Market, and FX Coverage read paths', async () => {
    const originalFetch = globalThis.fetch;
    const failingFetch = vi.fn().mockImplementation(() => {
      throw new Error(
        'UPSTREAM_CALL_FORBIDDEN: Upstream HTTP network call strictly forbidden during read flows',
      );
    });
    globalThis.fetch = failingFetch;

    try {
      const persistedProvider = new PersistedFxDataProvider(mockRepo);

      // Home/Today and Market surfaces read valuation via PersistedFxDataProvider
      (mockRepo.findObservation as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'obs-home-market',
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        observationDate: LocalDate.from('2026-10-16'),
        rate: '5.250000000000000000',
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

      // 1. Home / Market Valuation read path
      const rate = await persistedProvider.getRate('USD', 'BRL', LocalDate.from('2026-10-16'));
      expect(rate.rate.value).toBe('5.25');
      expect(failingFetch).not.toHaveBeenCalled();

      // 2. FX Coverage read path
      const coverageUseCase = new GetFxCoverageUseCase(mockRepo);
      const coverage = await coverageUseCase.execute('USD', 'BRL');
      expect(coverage.totalObservations).toBe(10);
      expect(coverage.baseCurrency).toBe('USD');
      expect(coverage.quoteCurrency).toBe('BRL');
      expect(failingFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Gate 16: Same-currency FX ingestion policy rejects same-currency requests with controlled 400', async () => {
    const updateUseCase = new UpdateFxDataUseCase(mockRepo);

    // BRL/BRL
    await expect(
      updateUseCase.execute({
        baseCurrency: 'BRL',
        quoteCurrency: 'BRL',
        from: '2026-01-01',
        to: '2026-01-10',
      }),
    ).rejects.toThrowError(/Same-currency FX pair 'BRL\/BRL' is not allowed for ingestion/);

    // USD/USD
    await expect(
      updateUseCase.execute({
        baseCurrency: 'USD',
        quoteCurrency: 'USD',
        from: '2026-01-01',
        to: '2026-01-10',
      }),
    ).rejects.toThrowError(/Same-currency FX pair 'USD\/USD' is not allowed for ingestion/);

    expect(mockRepo.upsertObservation).not.toHaveBeenCalled();
    expect(mockRepo.upsertObservations).not.toHaveBeenCalled();
  });
});
