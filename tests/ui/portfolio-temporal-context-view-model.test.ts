import { describe, it, expect } from 'vitest';
import {
  isValidCivilDate,
  formatCivilDateDisplay,
  resolveTemporalContext,
  stateQueryKey,
  assetStateQueryKey,
  accountStateQueryKey,
  appendAsOf,
} from '@atlas/ui';

const TODAY = '2026-09-19';

describe('UI: Portfolio Temporal Context View Model (Fase 2F)', () => {
  describe('civil date validation (no timezone, pure calendar math)', () => {
    it('accepts well-formed past dates', () => {
      expect(isValidCivilDate('2026-03-15')).toBe(true);
      expect(isValidCivilDate('2026-01-01')).toBe(true);
      expect(isValidCivilDate('2000-02-29')).toBe(true);
      expect(isValidCivilDate('2024-02-29')).toBe(true);
    });

    it('rejects malformed strings', () => {
      expect(isValidCivilDate('')).toBe(false);
      expect(isValidCivilDate('abc')).toBe(false);
      expect(isValidCivilDate('15/03/2026')).toBe(false);
      expect(isValidCivilDate('2026-3-5')).toBe(false);
      expect(isValidCivilDate('2026-03-15T00:00:00')).toBe(false);
    });

    it('rejects impossible calendar dates', () => {
      expect(isValidCivilDate('2026-02-30')).toBe(false);
      expect(isValidCivilDate('2025-04-31')).toBe(false);
      expect(isValidCivilDate('2026-13-01')).toBe(false);
      expect(isValidCivilDate('2026-00-10')).toBe(false);
      expect(isValidCivilDate('2026-02-29')).toBe(false);
      expect(isValidCivilDate('2026-04-31')).toBe(false);
    });
  });

  describe('display formatting (string split only)', () => {
    it('renders DD/MM/YYYY without Date construction', () => {
      expect(formatCivilDateDisplay('2026-03-15')).toBe('15/03/2026');
      expect(formatCivilDateDisplay('2026-01-05')).toBe('05/01/2026');
    });
  });

  describe('context resolution', () => {
    it('defaults to current mode without asOf', () => {
      for (const raw of [undefined, null, '']) {
        const ctx = resolveTemporalContext({ rawAsOf: raw ?? null, today: TODAY });
        expect(ctx.mode).toBe('CURRENT');
        expect(ctx.asOf).toBeNull();
        expect(ctx.bannerLabel).toBeNull();
        expect(ctx.error).toBeNull();
      }
    });

    it('enters historical mode for valid past dates', () => {
      const ctx = resolveTemporalContext({ rawAsOf: '2026-03-15', today: TODAY });
      expect(ctx.mode).toBe('HISTORICAL');
      expect(ctx.asOf).toBe('2026-03-15');
      expect(ctx.displayDate).toBe('15/03/2026');
      expect(ctx.bannerLabel).toBe('Visualizando carteira em 15/03/2026');
      expect(ctx.headerSuffix).toBe('em 15/03/2026');
      expect(ctx.error).toBeNull();
    });

    it('normalizes today to current mode', () => {
      const ctx = resolveTemporalContext({ rawAsOf: TODAY, today: TODAY });
      expect(ctx.mode).toBe('CURRENT');
      expect(ctx.asOf).toBeNull();
      expect(ctx.error).toBeNull();
    });

    it('rejects future dates without entering historical mode', () => {
      const ctx = resolveTemporalContext({ rawAsOf: '2026-09-20', today: TODAY });
      expect(ctx.mode).toBe('CURRENT');
      expect(ctx.asOf).toBeNull();
      expect(ctx.error).toBe('FUTURE');
      expect(ctx.errorMessage).toContain('hoje ou anterior');
    });

    it('rejects malformed dates with a clear message', () => {
      const ctx = resolveTemporalContext({ rawAsOf: 'abc', today: TODAY });
      expect(ctx.mode).toBe('CURRENT');
      expect(ctx.error).toBe('INVALID');
      expect(ctx.errorMessage).toContain('Data inválida');
    });

    it('trims surrounding whitespace', () => {
      const ctx = resolveTemporalContext({ rawAsOf: '  2026-03-15  ', today: TODAY });
      expect(ctx.mode).toBe('HISTORICAL');
      expect(ctx.asOf).toBe('2026-03-15');
    });
  });

  describe('cache isolation and link helpers', () => {
    it('isolates current and historical cache entries', () => {
      expect(stateQueryKey('p1', null)).toEqual(['portfolio-state', 'p1', 'current']);
      expect(stateQueryKey('p1', '2026-03-15')).toEqual(['portfolio-state', 'p1', '2026-03-15']);
      expect(assetStateQueryKey('p1', 'a1', null)).toEqual([
        'portfolio-asset',
        'p1',
        'a1',
        'current',
      ]);
      expect(accountStateQueryKey('p1', 'c1', '2026-03-15')).toEqual([
        'portfolio-account',
        'p1',
        'c1',
        '2026-03-15',
      ]);
    });

    it('appends asOf preserving existing query params', () => {
      expect(appendAsOf('/portfolio?portfolioId=p1', '2026-03-15')).toBe(
        '/portfolio?portfolioId=p1&asOf=2026-03-15',
      );
      expect(appendAsOf('/portfolio', '2026-03-15')).toBe('/portfolio?asOf=2026-03-15');
      expect(appendAsOf('/portfolio?portfolioId=p1', null)).toBe('/portfolio?portfolioId=p1');
    });
  });
});
