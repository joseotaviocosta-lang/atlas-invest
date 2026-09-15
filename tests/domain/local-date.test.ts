import { describe, it, expect } from 'vitest';
import { LocalDate, InvalidLocalDateError } from '../../packages/domain/src/index';

describe('Domain: LocalDate Primitive', () => {
  it('should accept valid calendar dates and leap year dates', () => {
    const normalDate = LocalDate.from('2026-09-15');
    expect(normalDate.toString()).toBe('2026-09-15');
    expect(normalDate.year).toBe(2026);
    expect(normalDate.month).toBe(9);
    expect(normalDate.day).toBe(15);

    // 2024 is a leap year (divisible by 4)
    const leapYearDate = LocalDate.from('2024-02-29');
    expect(leapYearDate.toString()).toBe('2024-02-29');
  });

  it('should reject invalid dates including non-leap year Feb 29, invalid months and bad formats', () => {
    // 2025 is not a leap year
    expect(() => LocalDate.from('2025-02-29')).toThrow(InvalidLocalDateError);

    // February never has 30 days
    expect(() => LocalDate.from('2026-02-30')).toThrow(InvalidLocalDateError);

    // Invalid month 13
    expect(() => LocalDate.from('2026-13-01')).toThrow(InvalidLocalDateError);

    // Non-canonical formats
    expect(() => LocalDate.from('15/09/2026')).toThrow(InvalidLocalDateError);
    expect(() => LocalDate.from('2026-9-1')).toThrow(InvalidLocalDateError);
    expect(() => LocalDate.from('abc')).toThrow(InvalidLocalDateError);
  });

  it('must remain invariant across all timezones without time-of-day offsets', () => {
    const dateStr = '2026-01-01';
    const date = LocalDate.from(dateStr);

    // Does not convert to midnight UTC or shift hours
    expect(date.toString()).toBe(dateStr);
    expect(date.toJSON()).toBe(dateStr);
  });

  it('should accurately compare dates chronologically', () => {
    const d1 = LocalDate.from('2026-01-15');
    const d2 = LocalDate.from('2026-02-01');
    const d3 = LocalDate.from('2026-02-01');

    expect(d1.isBefore(d2)).toBe(true);
    expect(d2.isAfter(d1)).toBe(true);
    expect(d2.equals(d3)).toBe(true);
    expect(d1.compare(d2)).toBe(-1);
    expect(d2.compare(d1)).toBe(1);
    expect(d2.compare(d3)).toBe(0);
  });

  it('should properly serialize and deserialize via round-trip', () => {
    const original = LocalDate.from('2026-09-15');
    const json = original.toJSON();

    expect(json).toBe('2026-09-15');

    const parsed = LocalDate.fromJSON(json);
    expect(parsed.equals(original)).toBe(true);
  });
});
