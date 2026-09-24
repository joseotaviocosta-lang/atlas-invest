import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { mapToPortfolioPerformanceViewModel } from '@atlas/ui';

describe('Performance View Model', () => {
  it('maps AVAILABLE correctly', () => {
    const vm = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-03-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '10.00',
          xirr: '9.50',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
      },
      status: 'COMPLETE',
      dataAvailability: 'AVAILABLE',
    });
    expect(vm!.isAvailable).toBe(true);
    expect(vm!.isPartial).toBe(false);
    expect(vm!.currencies[0]!.twrFormatted).toContain('10');
    expect(vm!.isUnavailable).toBe(false);
  });

  it('maps PARTIAL', () => {
    const vm = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '5.00',
          xirr: null,
          twrStatus: 'COMPLETE',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'PARTIAL',
          dataAvailability: 'PARTIAL',
        },
      },
      status: 'PARTIAL',
      dataAvailability: 'PARTIAL',
    });
    expect(vm!.isPartial).toBe(true);
    expect(vm!.statusLabel).toBe('Dados parciais');
  });

  it('maps UNAVAILABLE', () => {
    const vm = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: null,
          xirr: null,
          twrStatus: 'INSUFFICIENT_DATA',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
        },
      },
      status: 'INSUFFICIENT_DATA',
      dataAvailability: 'UNAVAILABLE',
    });
    expect(vm!.isUnavailable).toBe(true);
    expect(vm!.currencies[0]!.twrFormatted).toBe('—');
  });

  it('handles positive/negative/zero', () => {
    const pos = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '10.00',
          xirr: '-5.00',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
      },
      status: 'COMPLETE',
      dataAvailability: 'AVAILABLE',
    });
    expect(pos!.currencies[0]!.isPositiveTwr).toBe(true);
    expect(pos!.currencies[0]!.isPositiveXirr).toBe(false);
    const zero = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '0',
          xirr: '0',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
      },
      status: 'COMPLETE',
      dataAvailability: 'AVAILABLE',
    });
    expect(zero!.currencies[0]!.twrFormatted).toContain('0');
  });

  it('handles BRL only, USD only, BRL+USD', () => {
    const brlOnly = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '10.00',
          xirr: '10.00',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
      },
      status: 'COMPLETE',
      dataAvailability: 'AVAILABLE',
    });
    expect(brlOnly!.currencies).toHaveLength(1);
    expect(brlOnly!.currencies[0]!.currency).toBe('BRL');
    const both = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '10.00',
          xirr: '10.00',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
        USD: {
          currency: 'USD',
          twr: '5.00',
          xirr: '5.00',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
      },
      status: 'COMPLETE',
      dataAvailability: 'AVAILABLE',
    });
    expect(both!.currencies).toHaveLength(2);
  });

  it('handles custom period', () => {
    const vm = mapToPortfolioPerformanceViewModel({
      portfolioId: 'p1',
      period: { startDate: '2026-02-01', endDate: '2026-02-15' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '2.00',
          xirr: '2.00',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: 'AVAILABLE',
        },
      },
      status: 'COMPLETE',
      dataAvailability: 'AVAILABLE',
    });
    expect(vm!.period.display).toBe('01/02/2026 → 15/02/2026');
  });

  it('never calculates TWR/XIRR', () => {
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateTWR/);
    expect(code).not.toMatch(/calculateXIRR/);
    expect(code).not.toMatch(/Math\.pow/);
  });
});
