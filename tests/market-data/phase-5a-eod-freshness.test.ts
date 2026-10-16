import { describe, it, expect } from 'vitest';
import { classifyEodQuoteFreshness } from '@atlas/market-data';

describe('Market Data Phase 5A: EOD Quote Freshness Classifier & Weekend Handling', () => {
  describe('Canonical States (Section 7)', () => {
    it('Case A: returns FRESH when quote is from the latest expected trading day', () => {
      // Wednesday quote viewed on Wednesday
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-14' },
        viewDate: '2026-10-14',
      });
      expect(status).toBe('FRESH');
    });

    it('Case B: returns STALE when quote is older than expected session window', () => {
      // Quote from 2 weeks ago
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-09-30' },
        viewDate: '2026-10-14',
      });
      expect(status).toBe('STALE');
    });

    it('Case C: returns MISSING when no persisted quote exists for the asset', () => {
      const status = classifyEodQuoteFreshness({
        quote: null,
        hasProviderError: false,
      });
      expect(status).toBe('MISSING');
    });

    it('Case D: returns ERROR when provider was attempted and encountered an error', () => {
      const status = classifyEodQuoteFreshness({
        quote: null,
        hasProviderError: true,
      });
      expect(status).toBe('ERROR');
    });
  });

  describe('Weekend Handling & Monday Threshold (Section 8)', () => {
    // 2026-10-09 was a Friday.
    // 2026-10-10 was a Saturday.
    // 2026-10-11 was a Sunday.
    // 2026-10-12 was a Monday.

    it('Friday quote viewed on Saturday remains FRESH (weekend market closed)', () => {
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-09' },
        viewDate: '2026-10-10',
        viewHour: 15,
      });
      expect(status).toBe('FRESH');
    });

    it('Friday quote viewed on Sunday remains FRESH (weekend market closed)', () => {
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-09' },
        viewDate: '2026-10-11',
        viewHour: 20,
      });
      expect(status).toBe('FRESH');
    });

    it('Friday quote viewed on Monday BEFORE market close (15:00 BRT) remains FRESH', () => {
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-09' },
        viewDate: '2026-10-12',
        viewHour: 15, // before 18:00 threshold
      });
      expect(status).toBe('FRESH');
    });

    it('Friday quote viewed on Monday AFTER market close (19:00 BRT) becomes STALE if not refreshed', () => {
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-09' },
        viewDate: '2026-10-12',
        viewHour: 19, // after 18:00 threshold
      });
      expect(status).toBe('STALE');
    });

    it('Thursday quote viewed on Sunday is STALE (older than Friday session)', () => {
      // 2026-10-08 was a Thursday
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-08' },
        viewDate: '2026-10-11',
        viewHour: 14,
      });
      expect(status).toBe('STALE');
    });

    it('Weekday quote viewed on next calendar day before market close remains FRESH', () => {
      // Tuesday 2026-10-13 viewed on Wednesday 2026-10-14 at 11:00 BRT
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-13' },
        viewDate: '2026-10-14',
        viewHour: 11,
      });
      expect(status).toBe('FRESH');
    });

    it('Weekday quote viewed on next calendar day after market close becomes STALE', () => {
      // Tuesday 2026-10-13 viewed on Wednesday 2026-10-14 at 19:30 BRT
      const status = classifyEodQuoteFreshness({
        quote: { tradingDate: '2026-10-13' },
        viewDate: '2026-10-14',
        viewHour: 19,
      });
      expect(status).toBe('STALE');
    });
  });
});
