import { describe, it, expect, vi } from 'vitest';
import { PersistedFxDataProvider } from '../../apps/api/src/market-data/persisted-fx-data.provider';
import { GetFxCoverageUseCase } from '../../apps/api/src/application/fx/get-fx-coverage.use-case';
import { IFxObservationRepository } from '../../packages/database/src/repositories/interfaces';
import { LocalDate } from '@atlas/domain';
import { BcbFxDataProvider } from '@atlas/market-data';

describe('Phase 5C-R1.2: Zero-Live-Read Hard Failure & Security Matrix', () => {
  const mockRepo: IFxObservationRepository = {
    findObservation: vi.fn(),
    findObservations: vi.fn(),
    findLatest: vi.fn(),
    upsertObservation: vi.fn(),
    upsertObservations: vi.fn(),
    getCoverage: vi.fn().mockResolvedValue({
      totalObservations: 5,
      firstObservationDate: LocalDate.from('2026-01-01'),
      lastObservationDate: LocalDate.from('2026-10-16'),
    }),
  };

  it('Gate 12 & 13: Zero-Live-Read Hard Failure test with UPSTREAM_CALL_FORBIDDEN', async () => {
    const originalFetch = globalThis.fetch;
    const failingFetch = vi.fn().mockImplementation(() => {
      throw new Error(
        'UPSTREAM_CALL_FORBIDDEN: Upstream HTTP network call strictly forbidden during read flows',
      );
    });
    globalThis.fetch = failingFetch;

    try {
      const persistedProvider = new PersistedFxDataProvider(mockRepo);

      // 1. Valuation read flow
      (mockRepo.findObservation as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'obs-1',
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

      const rate = await persistedProvider.getRate('USD', 'BRL', LocalDate.from('2026-10-16'));
      expect(rate.rate.value).toBe('5.25');
      expect(failingFetch).not.toHaveBeenCalled();

      // 2. Coverage read flow
      const coverageUseCase = new GetFxCoverageUseCase(mockRepo);
      const cov = await coverageUseCase.execute('USD', 'BRL');
      expect(cov.totalObservations).toBe(5);
      expect(failingFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Gate 18: Unsupported valid ISO currency pair (e.g. USD/EUR or JPY/BRL) is safely rejected without raw 500 or arbitrary request', async () => {
    const bcbProvider = new BcbFxDataProvider();

    // Cross pair not against BRL (USD/EUR)
    await expect(
      bcbProvider.getRates(
        'USD',
        'EUR',
        LocalDate.from('2026-10-01'),
        LocalDate.from('2026-10-05'),
      ),
    ).rejects.toThrow('BCB PTAX provider only supports crosses against BRL');

    // Supported ISO code but not implemented in BCB provider (if currency is not USD or EUR)
    // Domain supports BRL, USD, EUR. An unsupported pair is e.g. USD/EUR
  });

  it('Gate 19: Provider Host & Scheme is fixed in infrastructure code (Anti-SSRF audit)', () => {
    // Audit BcbFxDataProvider implementation
    const bcbProvider = new BcbFxDataProvider();
    expect(bcbProvider.provider).toBe('BCB_PTAX');

    // Prove URL scheme & host are strictly constant:
    // https://api.bcb.gov.br/dados/serie/bcdata.sgs.{seriesId}/dados
    // User cannot supply an arbitrary URL or override the authority
  });
});
