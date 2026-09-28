import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  parseFiscalCompetence,
  fiscalCompetenceFromString,
  fiscalCompetenceFromDate,
  compareFiscalCompetence,
  fiscalCompetenceRange,
  isWithinCompetence,
  daysInMonth,
} from '@atlas/tax-engine';

describe('Phase 4A — FiscalCompetence (civil YYYY-MM)', () => {
  it('parses a valid canonical competence', () => {
    expect(parseFiscalCompetence('2026-09')).toEqual({ year: 2026, month: 9, value: '2026-09' });
    expect(parseFiscalCompetence('2026-12')).toEqual({ year: 2026, month: 12, value: '2026-12' });
  });

  it.each(['2026-13', '2026-00', '2026', '09/2026', '2026-9', '', '   ', 'abcd-ef', '2026-1'])(
    'rejects malformed competence %j',
    (input) => {
      expect(parseFiscalCompetence(input)).toBeNull();
    },
  );

  it('rejects non-string inputs', () => {
    expect(parseFiscalCompetence(null)).toBeNull();
    expect(parseFiscalCompetence(202609)).toBeNull();
    expect(parseFiscalCompetence({})).toBeNull();
  });

  it('throws via fiscalCompetenceFromString for invalid input', () => {
    expect(() => fiscalCompetenceFromString('2026-13')).toThrow(/2026-13/);
  });

  it('derives competence from an economic date (timezone-immune)', () => {
    expect(fiscalCompetenceFromDate(LocalDate.from('2026-09-15')).value).toBe('2026-09');
    expect(fiscalCompetenceFromDate(LocalDate.from('2026-01-01')).value).toBe('2026-01');
    expect(fiscalCompetenceFromDate(LocalDate.from('2026-12-31')).value).toBe('2026-12');
  });

  it('computes inclusive civil ranges including leap February', () => {
    const feb2024 = fiscalCompetenceRange(parseFiscalCompetence('2024-02')!);
    expect(feb2024.start.toString()).toBe('2024-02-01');
    expect(feb2024.end.toString()).toBe('2024-02-29');

    const feb2023 = fiscalCompetenceRange(parseFiscalCompetence('2023-02')!);
    expect(feb2023.end.toString()).toBe('2023-02-28');

    const sep = fiscalCompetenceRange(parseFiscalCompetence('2026-09')!);
    expect(sep.start.toString()).toBe('2026-09-01');
    expect(sep.end.toString()).toBe('2026-09-30');
  });

  it('daysInMonth handles leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('isWithinCompetence is inclusive of first and last day only', () => {
    const c = parseFiscalCompetence('2026-09')!;
    expect(isWithinCompetence(LocalDate.from('2026-09-01'), c)).toBe(true);
    expect(isWithinCompetence(LocalDate.from('2026-09-30'), c)).toBe(true);
    expect(isWithinCompetence(LocalDate.from('2026-10-01'), c)).toBe(false);
    expect(isWithinCompetence(LocalDate.from('2026-08-31'), c)).toBe(false);
  });

  it('compares competences chronologically', () => {
    const a = parseFiscalCompetence('2026-01')!;
    const b = parseFiscalCompetence('2026-02')!;
    expect(compareFiscalCompetence(a, b)).toBe(-1);
    expect(compareFiscalCompetence(b, a)).toBe(1);
    expect(compareFiscalCompetence(a, a)).toBe(0);
  });
});
