import { LocalDate } from '@atlas/domain';
import { InvalidFiscalCompetenceError } from './errors';

/**
 * Civil fiscal competence (apuração period), strictly `YYYY-MM`.
 * Timezone-immune: derived exclusively from the economic (civil) date.
 */
export interface FiscalCompetence {
  readonly year: number;
  readonly month: number;
  /** Canonical `YYYY-MM` value. */
  readonly value: string;
}

const COMPETENCE_REGEX = /^(\d{4})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Strictly parses a canonical civil competence. Rejects `2026-13`, `2026-00`,
 * `2026`, `09/2026` and any malformed input. Returns `null` (never throws)
 * so callers can fail closed deterministically.
 */
export function parseFiscalCompetence(input: unknown): FiscalCompetence | null {
  if (typeof input !== 'string') return null;
  const match = COMPETENCE_REGEX.exec(input.trim());
  if (!match) return null;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  if (year < 1900 || year > 9999) return null;
  return Object.freeze({ year, month, value: `${match[1]}-${match[2]}` });
}

/** Same as {@link parseFiscalCompetence} but throws for invalid input. */
export function fiscalCompetenceFromString(input: string): FiscalCompetence {
  const parsed = parseFiscalCompetence(input);
  if (!parsed) {
    throw new InvalidFiscalCompetenceError(
      `Invalid fiscal competence '${input}'. Expected canonical 'YYYY-MM'`,
    );
  }
  return parsed;
}

/** Derives the competence from an economic (civil) date. */
export function fiscalCompetenceFromDate(date: LocalDate): FiscalCompetence {
  const month = date.month.toString().padStart(2, '0');
  return Object.freeze({ year: date.year, month: date.month, value: `${date.year}-${month}` });
}

/**
 * Immediately subsequent civil competence (`YYYY-MM` → next calendar month).
 * Returns `null` for malformed input. Used by the minimum-DARF carry-forward
 * rule ("período de apuração subsequente").
 */
export function nextFiscalCompetence(competence: string): string | null {
  const parsed = parseFiscalCompetence(competence);
  if (!parsed) return null;
  let year = parsed.year;
  let month = parsed.month + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** Compares two competences chronologically. */
export function compareFiscalCompetence(a: FiscalCompetence, b: FiscalCompetence): -1 | 0 | 1 {
  if (a.value < b.value) return -1;
  if (a.value > b.value) return 1;
  return 0;
}

/** Inclusive civil date range `[first day, last day]` of a competence. */
export function fiscalCompetenceRange(competence: FiscalCompetence): {
  start: LocalDate;
  end: LocalDate;
} {
  const start = LocalDate.fromParts(competence.year, competence.month, 1);
  const end = LocalDate.fromParts(
    competence.year,
    competence.month,
    daysInMonth(competence.year, competence.month),
  );
  return { start, end };
}

/** True when the given economic date belongs to the competence (inclusive). */
export function isWithinCompetence(date: LocalDate, competence: FiscalCompetence): boolean {
  return date.year === competence.year && date.month === competence.month;
}
