import { describe, it, expect } from 'vitest';
import { LocalDate, Quantity } from '@atlas/domain';
import { PersistedFxDataProvider } from '../../apps/api/src/market-data/persisted-fx-data.provider';
import { IFxObservationRepository } from '../../packages/database/src/repositories/interfaces';

describe('Phase 5C-R1.2: Complete I4 Guard Matrix', () => {
  const mockRepo: IFxObservationRepository = {
    findObservation: async (_base, _quote, date) => {
      // Return a rate only if date is 2026-10-16
      if (date.toString() === '2026-10-16') {
        return {
          id: 'obs-spot',
          baseCurrency: 'USD',
          quoteCurrency: 'BRL',
          observationDate: date,
          rate: '5.500000000000000000',
          rateType: 'MID',
          source: 'BCB_PTAX',
          providerSeriesId: '10813',
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
    findObservations: async () => [],
    findLatest: async () => null,
    upsertObservation: async () => ({}) as never,
    upsertObservations: async () => [],
    getCoverage: async () => ({
      totalObservations: 1,
      firstObservationDate: LocalDate.from('2026-10-16'),
      lastObservationDate: LocalDate.from('2026-10-16'),
    }),
  };

  it('Gate 21 & 23: Cash flow on past date D1 cannot use current FX at D2', async () => {
    const provider = new PersistedFxDataProvider(mockRepo);
    const pastCashFlowDate = LocalDate.from('2026-01-10'); // Months before spot date

    await expect(provider.getRate('USD', 'BRL', pastCashFlowDate)).rejects.toThrow(
      'FX observation not found in database for USD/BRL on 2026-01-10',
    );
  });

  it('Gate 22: Lookback bound is strictly capped at maxLookbackDays = 7', async () => {
    const provider = new PersistedFxDataProvider(mockRepo, { maxLookbackDays: 7 });
    // Date is 8 days after 2026-10-16 -> 2026-10-24
    const eightDaysLater = LocalDate.from('2026-10-24');

    await expect(provider.getRate('USD', 'BRL', eightDaysLater)).rejects.toThrow(
      'within 7 days lookback',
    );
  });

  it('Gate 24: Foreign currency with missing FX NEVER falls back to 1.0 or identity', async () => {
    const provider = new PersistedFxDataProvider(mockRepo);
    const missingDate = LocalDate.from('2025-05-01');

    await expect(provider.getRate('USD', 'BRL', missingDate)).rejects.toThrow(
      'FX observation not found in database',
    );
  });

  it('Gate 25: Zero client-side financial float math for FX conversions', () => {
    // Arbitrary precision Quantity multiplication must be used
    const qty = Quantity.from('100.500000000000000000');
    const rate = Quantity.from('5.250000000000000000');
    const converted = qty.multiply(rate);

    expect(converted.value).toBe('527.625');
    expect(typeof converted.value).toBe('string');
  });
});
