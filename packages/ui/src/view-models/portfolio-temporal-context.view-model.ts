/**
 * Temporal context view model (Fase 2F — Historical As-Of UX & Time Travel).
 *
 * A historical portfolio state is ALWAYS a visual projection of the official
 * server replay (`GET /state?asOf=YYYY-MM-DD`). This module only resolves
 * *which* snapshot the user asked for and how to label it. It never touches
 * transactions, quantities, costs or gains.
 *
 * Civil-date rules (LocalDate semantics, ADR-008/ADR-064):
 * - `asOf` travels as an ISO civil string `YYYY-MM-DD`, never as a timestamp.
 * - Validation is pure string/calendar math: no `new Date(asOf)` semantics,
 *   so no timezone can shift the economic day.
 * - "Today" is read from local civil fields (`getFullYear/getMonth/getDate`),
 *   which is a wall-clock reading, not a UTC conversion of `asOf`.
 */

export type TemporalMode = 'CURRENT' | 'HISTORICAL';

export type TemporalDateError = 'INVALID' | 'FUTURE' | null;

export interface TemporalContextViewModel {
  readonly mode: TemporalMode;
  /** Canonical civil date `YYYY-MM-DD`, or `null` in current mode. */
  readonly asOf: string | null;
  /** Display date `DD/MM/YYYY`, or `null` in current mode. */
  readonly displayDate: string | null;
  /** Persistent banner label, e.g. `Visualizando carteira em 15/03/2026`. */
  readonly bannerLabel: string | null;
  /** Short header suffix, e.g. `em 15/03/2026`. */
  readonly headerSuffix: string | null;
  readonly error: TemporalDateError;
  readonly errorMessage: string | null;
}

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Strict civil Gregorian calendar check for `YYYY-MM-DD`.
 * Pure string/integer math — no `Date` parsing, no timezone.
 */
export function isValidCivilDate(value: string): boolean {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  let maxDay = DAYS_IN_MONTH[month - 1]!;
  if (month === 2 && isLeapYear(year)) maxDay = 29;
  return day <= maxDay;
}

/**
 * Formats a valid civil `YYYY-MM-DD` as `DD/MM/YYYY` via string split.
 * Assumes a validated input; never constructs a `Date`.
 */
export function formatCivilDateDisplay(yyyyMmDd: string): string {
  const [year = '', month = '', day = ''] = yyyyMmDd.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Local civil "today" as `YYYY-MM-DD`, read from wall-clock fields.
 * Used only as the upper bound for `asOf`, never to reinterpret `asOf`.
 */
export function getTodayCivilDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface ResolveTemporalContextOptions {
  /** Raw `asOf` candidate from URL/route params (may be null/undefined). */
  readonly rawAsOf?: string | null;
  /** Injectable "today" for determinism in tests (`YYYY-MM-DD`). */
  readonly today?: string;
}

/**
 * Resolves the temporal context for portfolio reads.
 *
 * - absent/blank → CURRENT (default behavior, unchanged).
 * - valid past date → HISTORICAL.
 * - valid date equal to today → CURRENT (today normalization; avoids `?asOf=today`).
 * - future date → CURRENT + `FUTURE` error (UI must refuse, never send).
 * - malformed/impossible date → CURRENT + `INVALID` error (UI shows date error).
 */
export function resolveTemporalContext(
  options: ResolveTemporalContextOptions = {},
): TemporalContextViewModel {
  const today = options.today ?? getTodayCivilDateString();
  const raw = (options.rawAsOf ?? '').trim();

  if (!raw) {
    return {
      mode: 'CURRENT',
      asOf: null,
      displayDate: null,
      bannerLabel: null,
      headerSuffix: null,
      error: null,
      errorMessage: null,
    };
  }

  if (!isValidCivilDate(raw)) {
    return {
      mode: 'CURRENT',
      asOf: null,
      displayDate: null,
      bannerLabel: null,
      headerSuffix: null,
      error: 'INVALID',
      errorMessage: 'Data inválida. Escolha uma data no formato DD/MM/AAAA.',
    };
  }

  if (raw > today) {
    return {
      mode: 'CURRENT',
      asOf: null,
      displayDate: null,
      bannerLabel: null,
      headerSuffix: null,
      error: 'FUTURE',
      errorMessage: 'Escolha uma data de hoje ou anterior.',
    };
  }

  if (raw === today) {
    return {
      mode: 'CURRENT',
      asOf: null,
      displayDate: null,
      bannerLabel: null,
      headerSuffix: null,
      error: null,
      errorMessage: null,
    };
  }

  const displayDate = formatCivilDateDisplay(raw);
  return {
    mode: 'HISTORICAL',
    asOf: raw,
    displayDate,
    bannerLabel: `Visualizando carteira em ${displayDate}`,
    headerSuffix: `em ${displayDate}`,
    error: null,
    errorMessage: null,
  };
}

// ---------------------------------------------------------------------------
// Cache-key and link helpers (current/historical isolation)
// ---------------------------------------------------------------------------

export function stateQueryKey(portfolioId: string, asOf: string | null): readonly unknown[] {
  return ['portfolio-state', portfolioId, asOf ?? 'current'];
}

export function assetStateQueryKey(
  portfolioId: string,
  assetId: string,
  asOf: string | null,
): readonly unknown[] {
  return ['portfolio-asset', portfolioId, assetId, asOf ?? 'current'];
}

export function accountStateQueryKey(
  portfolioId: string,
  accountId: string,
  asOf: string | null,
): readonly unknown[] {
  return ['portfolio-account', portfolioId, accountId, asOf ?? 'current'];
}

/**
 * Appends (or preserves) the `asOf` query param on an internal href.
 * Pure string handling; `null` returns the href untouched.
 */
export function appendAsOf(href: string, asOf: string | null): string {
  if (!asOf) return href;
  return href.includes('?') ? `${href}&asOf=${asOf}` : `${href}?asOf=${asOf}`;
}
