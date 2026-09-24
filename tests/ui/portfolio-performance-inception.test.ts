import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { getPeriodDates } from '@atlas/ui';

describe('Performance Inception Semantics', () => {
  const today = '2026-09-20';

  it('A) portfolio 3 months old, 1Y → start = inception', () => {
    const inception = '2026-06-15';
    const period = getPeriodDates('1Y', today, undefined, undefined, inception);
    expect(period?.startDate).toBe(inception);
    expect(period?.endDate).toBe(today);
  });

  it('B) portfolio 3 years old, 1Y → start = today -1y', () => {
    const inception = '2023-01-01';
    const period = getPeriodDates('1Y', today, undefined, undefined, inception);
    expect(period?.startDate).toBe('2025-09-20');
    expect(period?.endDate).toBe(today);
  });

  it('C) INCEPTION preset → start = inception real', () => {
    const inception = '2024-03-10';
    const period = getPeriodDates('INCEPTION', today, undefined, undefined, inception);
    expect(period?.startDate).toBe(inception);
    expect(period?.endDate).toBe(today);
  });

  it('D) no inception → INCEPTION returns null, not 2020-01-01', () => {
    const period = getPeriodDates('INCEPTION', today, undefined, undefined, null);
    expect(period).toBeNull();
    const period2 = getPeriodDates('INCEPTION', today, undefined, undefined, undefined);
    expect(period2).toBeNull();
  });

  it('E) custom period still works normally', () => {
    const inception = '2026-01-01';
    const period = getPeriodDates('CUSTOM', today, '2026-02-01', '2026-02-15', inception);
    expect(period?.startDate).toBe('2026-02-01');
    expect(period?.endDate).toBe('2026-02-15');
  });

  it('no hardcoded 2020-01-01', () => {
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
      'utf8',
    );
    expect(code).not.toContain('2020-01-01');
  });

  it('1Y clamps to inception', () => {
    const inception = '2026-08-01';
    const period = getPeriodDates('1Y', '2026-09-20', undefined, undefined, inception);
    expect(period?.startDate).toBe(inception);
  });

  it('YTD not clamped if after inception', () => {
    const inception = '2020-01-01';
    const period = getPeriodDates('YTD', today, undefined, undefined, inception);
    expect(period?.startDate).toBe('2026-01-01');
  });
});
