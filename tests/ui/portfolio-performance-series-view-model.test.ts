import { describe, it, expect } from 'vitest';
import { mapToPortfolioPerformanceSeriesViewModel, performanceSeriesQueryKey } from '@atlas/ui';

function raw(points: Array<{ date: string; p: string | null; b?: string | null }>) {
  return {
    portfolioId: 'p1',
    period: { startDate: points[0]!.date, endDate: points[points.length - 1]!.date },
    requestedGranularity: 'AUTO',
    currencies: {
      BRL: {
        currency: 'BRL',
        granularity: 'DAILY',
        status: 'COMPLETE',
        dataAvailability: 'AVAILABLE',
        benchmark: {
          id: 'CDI',
          name: 'CDI',
          currency: 'BRL',
          type: 'RATE_SERIES',
          status: 'AVAILABLE',
          dataAvailability: 'AVAILABLE',
        },
        points: points.map((x) => ({
          date: x.date,
          portfolioReturn: x.p,
          benchmarkReturn: x.b ?? null,
          status: x.p === null ? 'UNAVAILABLE' : 'COMPLETE',
        })),
      },
    },
    status: 'COMPLETE',
    dataAvailability: 'AVAILABLE',
  };
}

describe('Performance Series View Model', () => {
  it('maps start 0% with + prefix on gains', () => {
    const vm = mapToPortfolioPerformanceSeriesViewModel(
      raw([
        { date: '2026-01-01', p: '0', b: '0' },
        { date: '2026-01-02', p: '12.50', b: '8.40' },
      ]),
    );
    expect(vm!.currencies[0]!.points[0]!.portfolioReturnFormatted).toContain('0');
    expect(vm!.currencies[0]!.points[1]!.portfolioReturnFormatted.startsWith('+')).toBe(true);
    expect(vm!.currencies[0]!.points[1]!.tooltip).toContain('Carteira:');
    expect(vm!.currencies[0]!.points[1]!.tooltip).toContain('CDI:');
  });

  it('null renders — and marks gap', () => {
    const vm = mapToPortfolioPerformanceSeriesViewModel(
      raw([
        { date: '2026-01-01', p: '0' },
        { date: '2026-01-02', p: null },
      ]),
    );
    const pts = vm!.currencies[0]!.points;
    expect(pts[1]!.portfolioReturnFormatted).toBe('—');
    expect(pts[1]!.isGap).toBe(true);
    expect(vm!.currencies[0]!.hasGaps).toBe(true);
    expect(vm!.currencies[0]!.valuedPoints).toHaveLength(1);
  });

  it('negative keeps minus sign without double plus', () => {
    const vm = mapToPortfolioPerformanceSeriesViewModel(
      raw([
        { date: '2026-01-01', p: '0' },
        { date: '2026-01-02', p: '-3.25' },
      ]),
    );
    const f = vm!.currencies[0]!.points[1]!.portfolioReturnFormatted;
    expect(f.startsWith('+')).toBe(false);
    expect(f).toContain('-');
  });

  it('accessibility summary mentions period and normalization', () => {
    const vm = mapToPortfolioPerformanceSeriesViewModel(
      raw([
        { date: '2026-01-01', p: '0' },
        { date: '2026-01-02', p: '1.00' },
      ]),
    );
    expect(vm!.accessibilitySummary).toContain('0%');
    expect(vm!.accessibilitySummary).toContain('01/01/2026');
  });

  it('series query key isolates benchmark+granularity', () => {
    expect(performanceSeriesQueryKey('p', '2026-01-01', '2026-02-01', 'CDI', 'AUTO')).toEqual([
      'portfolio-performance-series',
      'p',
      '2026-01-01',
      '2026-02-01',
      'CDI',
      'AUTO',
    ]);
  });

  it('never performs financial math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-performance-series.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateTWR/);
    expect(code).not.toMatch(/calculateBenchmarkReturn/);
    expect(code).not.toMatch(/Math\.pow/);
    expect(code).not.toMatch(/dailyFactor/);
  });
});
