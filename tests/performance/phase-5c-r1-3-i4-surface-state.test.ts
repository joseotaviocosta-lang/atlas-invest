import { describe, it, expect } from 'vitest';
import {
  mapToPortfolioPerformanceViewModel,
  RawPerformanceData,
} from '../../packages/ui/src/view-models/portfolio-performance.view-model';

describe('Phase 5C-R1.3: I4 Multi-Currency Performance Surface State (Web & API Contract)', () => {
  it('Gate 17 & 18: Mixed-currency portfolio presents segregated native currencies with ZERO fabricated consolidated TWR', () => {
    // API response contract for mixed-currency portfolio where BRL has TWR and USD has TWR, or USD is UNAVAILABLE
    const rawApiData: RawPerformanceData = {
      portfolioId: 'portfolio-mixed',
      period: { startDate: '2026-09-17', endDate: '2026-10-16' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '2.35',
          xirr: null,
          twrStatus: 'COMPLETE',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
          benchmark: {
            id: 'IBOV',
            name: 'Ibovespa',
            currency: 'BRL',
            return: '10.91',
            status: 'COMPLETE',
            dataAvailability: 'AVAILABLE',
          },
          differencePercentagePoints: '-8.56',
        },
        USD: {
          currency: 'USD',
          twr: null,
          xirr: null,
          twrStatus: 'INSUFFICIENT_DATA',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
          benchmark: null,
          differencePercentagePoints: null,
        },
      },
      status: 'PARTIAL',
      dataAvailability: 'PARTIAL',
    };

    const vm = mapToPortfolioPerformanceViewModel(rawApiData);
    expect(vm).toBeDefined();

    // Invariant 1: Top-level status is PARTIAL (never falsely marked complete)
    expect(vm!.isAvailable).toBe(false);
    expect(vm!.isPartial).toBe(true);
    expect(vm!.isUnavailable).toBe(false);

    // Invariant 2: Currencies are strictly segregated into native buckets
    expect(vm!.currencies).toHaveLength(2);

    const brlCur = vm!.currencies.find((c) => c.currency === 'BRL')!;
    expect(brlCur.twrFormatted).toBe('2,35%');
    expect(brlCur.dataAvailability).toBe('AVAILABLE');

    const usdCur = vm!.currencies.find((c) => c.currency === 'USD')!;
    // Invariant 3: Unsupported / unpriced historical currency shows dash "—" and UNAVAILABLE
    expect(usdCur.twrFormatted).toBe('—');
    expect(usdCur.dataAvailability).toBe('UNAVAILABLE');

    // Invariant 4: No consolidated cross-currency TWR is fabricated
    expect((vm as unknown as { consolidatedTwr?: unknown }).consolidatedTwr).toBeUndefined();
  });
});
