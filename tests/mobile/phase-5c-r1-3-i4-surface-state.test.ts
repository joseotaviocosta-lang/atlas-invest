import { describe, it, expect } from 'vitest';
import { mapToPortfolioPerformanceViewModel, RawPerformanceData } from '@atlas/ui';

describe('Phase 5C-R1.3: Mobile I4 Mixed-Currency Segregated Performance State', () => {
  it('Gate 19: Mobile performance view model renders strictly segregated currency buckets with no fabricated consolidated TWR', () => {
    const rawApiData: RawPerformanceData = {
      portfolioId: 'portfolio-mobile-mixed',
      period: { startDate: '2026-09-17', endDate: '2026-10-16' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '5.12',
          xirr: null,
          twrStatus: 'COMPLETE',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
          benchmark: null,
          differencePercentagePoints: null,
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

    // Mobile uses vm.isPartial to show warning banner:
    // "Alguns preços históricos não estavam disponíveis. Resultados parciais."
    expect(vm!.isPartial).toBe(true);

    // Mobile renders each currency in its own separate Card:
    expect(vm!.currencies.map((c) => c.currency)).toEqual(['BRL', 'USD']);

    const brl = vm!.currencies.find((c) => c.currency === 'BRL')!;
    expect(brl.twrFormatted).toBe('5,12%');

    const usd = vm!.currencies.find((c) => c.currency === 'USD')!;
    expect(usd.twrFormatted).toBe('—');
    expect(usd.dataAvailability).toBe('UNAVAILABLE');

    // Zero fabricated consolidated percentage
    expect((vm as unknown as { consolidatedTwr?: unknown }).consolidatedTwr).toBeUndefined();
  });
});
