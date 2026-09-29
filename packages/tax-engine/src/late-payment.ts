import { Money } from '@atlas/domain';

/**
 * Phase 4D.2 — Overdue tax adjustment (late fee + interest) pure domain.
 *
 * Deterministic, zero-I/O. The original principal is never mutated; the updated
 * amount is a derived value for an explicit paymentDate (ADR-274). Rounding is
 * ROUND_HALF_EVEN at 2 decimals per component (ADR-273). Business-day-sensitive
 * late-fee authority is supplied by an official snapshot — no generic holiday
 * calendar is implemented (ADR-275).
 */
export const LATE_PAYMENT_ROUNDING_MODES = ['ROUND_HALF_EVEN'] as const;
export type LatePaymentRoundingMode = (typeof LATE_PAYMENT_ROUNDING_MODES)[number];

export const LATE_PAYMENT_INTEREST_METHODS = [
  'SELIC_MONTHLY_SIMPLE_SUM_PLUS_PAYMENT_MONTH_1_PERCENT',
] as const;
export type LatePaymentInterestMethod = (typeof LATE_PAYMENT_INTEREST_METHODS)[number];

export const TAX_PAYMENT_ADJUSTMENT_STATUSES = ['NOT_LATE', 'READY', 'BLOCKED'] as const;
export type TaxPaymentAdjustmentStatus = (typeof TAX_PAYMENT_ADJUSTMENT_STATUSES)[number];

export const TAX_PAYMENT_ADJUSTMENT_REASON_CODES = [
  'MISSING_LATE_FEE_AUTHORITY',
  'AUTHORITY_PARITY_MISMATCH',
  'MISSING_OFFICIAL_INTEREST_RATE',
  'INVALID_PAYMENT_DATE',
] as const;
export type TaxPaymentAdjustmentReasonCode = (typeof TAX_PAYMENT_ADJUSTMENT_REASON_CODES)[number];

export interface LatePaymentRuleSet {
  readonly ruleId: string;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  /** Exact decimal percent, e.g. "0.33". */
  readonly dailyPenaltyRate: string;
  /** Exact decimal percent, e.g. "20". */
  readonly penaltyCapRate: string;
  readonly penaltyStartAuthority: 'OFFICIAL_SNAPSHOT';
  readonly interestMethod: LatePaymentInterestMethod;
  readonly paymentMonthRate: string;
  readonly roundingMode: LatePaymentRoundingMode;
  readonly moneyScale: number;
  readonly legalSourceIds: readonly string[];
  readonly verifiedAt: string;
}

export interface OfficialLateFeeAuthority {
  readonly snapshotId: string;
  readonly version: number;
  /** Official first business day after the due date, when known. */
  readonly startBusinessDate: string | null;
  /** Official late-fee amount (exact decimal string). */
  readonly amount: string;
  /** Official late-fee percentage (exact decimal string). */
  readonly percentage: string;
}

export interface OfficialInterestRate {
  readonly snapshotId: string;
  readonly version: number;
  readonly referenceMonth: string;
  readonly ratePercent: string;
}

export interface TaxPaymentAdjustmentTraceEntry {
  readonly stage: string;
  readonly detail: string;
  readonly values?: Readonly<Record<string, string>>;
}

export interface TaxPaymentAdjustment {
  readonly obligationId: string;
  readonly obligationFingerprint: string;
  readonly principalAmount: string;
  readonly currency: string;
  readonly dueDate: string;
  readonly paymentDate: string;
  readonly lateFeeAmount: string;
  readonly interestAmount: string;
  readonly updatedAmount: string;
  readonly lateFeePercentage: string;
  readonly interestPercentage: string;
  readonly daysLate: number;
  readonly status: TaxPaymentAdjustmentStatus;
  readonly reasonCode: TaxPaymentAdjustmentReasonCode | null;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly lateFeeAuthorityId: string | null;
  readonly interestRateSnapshotIds: readonly string[];
  readonly roundingMode: LatePaymentRoundingMode;
  readonly fingerprint: string;
  readonly trace: readonly TaxPaymentAdjustmentTraceEntry[];
}

export interface BuildTaxPaymentAdjustmentInput {
  readonly obligationId: string;
  readonly obligationFingerprint: string;
  readonly principalAmount: string;
  readonly currency: string;
  readonly dueDate: string;
  readonly paymentDate: string;
  readonly rule: LatePaymentRuleSet;
  readonly lateFeeAuthority: OfficialLateFeeAuthority | null;
  readonly interestRates: readonly OfficialInterestRate[];
}

const CIVIL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-\d{2}$/;

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CIVIL_DATE_REGEX.test(value)) return false;
  const year = parseInt(value.slice(0, 4), 10);
  const month = parseInt(value.slice(5, 7), 10);
  const day = parseInt(value.slice(8, 10), 10);
  if (month < 1 || month > 12) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day >= 1 && day <= daysInMonth;
}

/**
 * Exact ROUND_HALF_EVEN (banker's rounding) of a canonical decimal string to
 * `scale` decimals. Pure integer/string arithmetic — no JS float, no Math.round.
 */
export function roundHalfEven(value: string, scale: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal string '${value}'`);
  const sign = match[1] === '-' ? '-' : '';
  const intPart = match[2]!;
  const fracPart = match[3] ?? '';
  if (fracPart.length <= scale) {
    const padded = fracPart.padEnd(scale, '0');
    return scale > 0 ? `${sign}${intPart}.${padded}` : `${sign}${intPart}`;
  }
  const keep = fracPart.slice(0, scale);
  const nextDigit = fracPart.charCodeAt(scale) - 48;
  const rest = fracPart.slice(scale + 1);
  const restNonZero = /[1-9]/.test(rest);
  const digits = intPart + keep; // BigInt-safe
  let big = BigInt(digits);
  const roundUp = nextDigit > 5 || (nextDigit === 5 && (restNonZero || big % 2n === 1n));
  if (roundUp) big += 1n;
  let out = big.toString();
  if (scale > 0) {
    out = out.padStart(scale + 1, '0');
    out = `${out.slice(0, -scale)}.${out.slice(-scale)}`;
  }
  return `${sign}${out}`;
}

function addDecimals(a: string, b: string, currency: string): string {
  return Money.from(a, currency).add(Money.from(b, currency)).amount;
}

function multiplyPercent(principal: string, percent: string, currency: string): string {
  // Exact finite decimal: principal * percent / 100 (no premature rounding).
  return Money.from(principal, currency).multiply(percent).divide('100').amount;
}

/** Best-effort day count derived from the official percentage (informational). */
function deriveDaysLate(percentage: string, dailyRate: string, currency: string): number {
  const quotient = Money.from(percentage, currency).divide(dailyRate).amount;
  return parseInt(roundHalfEven(quotient, 0), 10);
}

/** Months strictly after `dueMonth` and strictly before `paymentMonth`. */
export function monthsBetween(dueMonth: string, paymentMonth: string): string[] {
  if (!MONTH_REGEX.test(dueMonth) || !MONTH_REGEX.test(paymentMonth)) return [];
  const out: string[] = [];
  let [y, m] = dueMonth.split('-').map(Number) as [number, number];
  for (;;) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const cur = `${y}-${String(m).padStart(2, '0')}`;
    if (cur >= paymentMonth) break;
    out.push(cur);
  }
  return out;
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

/**
 * Builds the deterministic overdue adjustment. Fails closed (BLOCKED) whenever
 * the official late-fee authority or a required SELIC rate is missing, or the
 * local formula disagrees with the official late-fee snapshot (ADR-270/271/272).
 */
export function buildTaxPaymentAdjustment(
  input: BuildTaxPaymentAdjustmentInput,
): TaxPaymentAdjustment {
  const { currency, rule } = input;
  const trace: TaxPaymentAdjustmentTraceEntry[] = [];
  const base = {
    obligationId: input.obligationId,
    obligationFingerprint: input.obligationFingerprint,
    principalAmount: input.principalAmount,
    currency,
    dueDate: input.dueDate,
    paymentDate: input.paymentDate,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    roundingMode: rule.roundingMode,
  };

  const fingerprint = computeAdjustmentFingerprint(input);

  if (!isCivilDate(input.dueDate) || !isCivilDate(input.paymentDate)) {
    return {
      ...base,
      lateFeeAmount: '0.00',
      interestAmount: '0.00',
      updatedAmount: input.principalAmount,
      lateFeePercentage: '0',
      interestPercentage: '0',
      daysLate: 0,
      status: 'BLOCKED',
      reasonCode: 'INVALID_PAYMENT_DATE',
      lateFeeAuthorityId: null,
      interestRateSnapshotIds: [],
      fingerprint,
      trace: Object.freeze([
        {
          stage: 'INPUT',
          detail: 'invalid-civil-date',
          values: { dueDate: input.dueDate, paymentDate: input.paymentDate },
        },
      ]),
    };
  }

  if (input.paymentDate <= input.dueDate) {
    trace.push({
      stage: 'TIMELINESS',
      detail: 'not-late',
      values: { dueDate: input.dueDate, paymentDate: input.paymentDate },
    });
    return {
      ...base,
      lateFeeAmount: '0.00',
      interestAmount: '0.00',
      updatedAmount: roundHalfEven(input.principalAmount, rule.moneyScale),
      lateFeePercentage: '0',
      interestPercentage: '0',
      daysLate: 0,
      status: 'NOT_LATE',
      reasonCode: null,
      lateFeeAuthorityId: null,
      interestRateSnapshotIds: [],
      fingerprint,
      trace: Object.freeze(trace),
    };
  }

  // --- Late fee (official authority + local parity) ---
  if (!input.lateFeeAuthority) {
    trace.push({ stage: 'LATE_FEE', detail: 'missing-official-authority' });
    return {
      ...base,
      lateFeeAmount: '0.00',
      interestAmount: '0.00',
      updatedAmount: input.principalAmount,
      lateFeePercentage: '0',
      interestPercentage: '0',
      daysLate: 0,
      status: 'BLOCKED',
      reasonCode: 'MISSING_LATE_FEE_AUTHORITY',
      lateFeeAuthorityId: null,
      interestRateSnapshotIds: [],
      fingerprint,
      trace: Object.freeze(trace),
    };
  }
  const authority = input.lateFeeAuthority;
  const penaltyPct = authority.percentage;
  const daysLate = authority.startBusinessDate
    ? daysBetweenInclusive(isoDate(authority.startBusinessDate), input.paymentDate)
    : deriveDaysLate(penaltyPct, rule.dailyPenaltyRate, currency);
  const lateFeeRaw = multiplyPercent(input.principalAmount, penaltyPct, currency);
  const lateFee = roundHalfEven(lateFeeRaw, rule.moneyScale);
  trace.push({
    stage: 'LATE_FEE',
    detail: 'local-formula',
    values: {
      startBusinessDate: authority.startBusinessDate ?? 'derived-from-official-percentage',
      daysLate: String(daysLate),
      penaltyPercentage: penaltyPct,
      rawAmount: lateFeeRaw,
      roundedAmount: lateFee,
      officialAmount: authority.amount,
      officialPercentage: authority.percentage,
    },
  });
  if (lateFee !== roundHalfEven(authority.amount, rule.moneyScale)) {
    trace.push({ stage: 'LATE_FEE', detail: 'authority-parity-mismatch' });
    return {
      ...base,
      lateFeeAmount: '0.00',
      interestAmount: '0.00',
      updatedAmount: input.principalAmount,
      lateFeePercentage: '0',
      interestPercentage: '0',
      daysLate,
      status: 'BLOCKED',
      reasonCode: 'AUTHORITY_PARITY_MISMATCH',
      lateFeeAuthorityId: authority.snapshotId,
      interestRateSnapshotIds: [],
      fingerprint,
      trace: Object.freeze(trace),
    };
  }

  // --- Interest (SELIC monthly simple sum + 1% payment month) ---
  const dueMonth = input.dueDate.slice(0, 7);
  const paymentMonth = input.paymentDate.slice(0, 7);
  let interestPercentage = '0';
  const usedRateIds: string[] = [];
  if (dueMonth !== paymentMonth) {
    const months = monthsBetween(dueMonth, paymentMonth);
    let sum = Money.from(rule.paymentMonthRate, currency);
    for (const month of months) {
      const rate = input.interestRates.find((r) => r.referenceMonth === month);
      if (!rate) {
        trace.push({
          stage: 'INTEREST',
          detail: 'missing-official-interest-rate',
          values: { month },
        });
        return {
          ...base,
          lateFeeAmount: lateFee,
          interestAmount: '0.00',
          updatedAmount: input.principalAmount,
          lateFeePercentage: penaltyPct,
          interestPercentage: '0',
          daysLate,
          status: 'BLOCKED',
          reasonCode: 'MISSING_OFFICIAL_INTEREST_RATE',
          lateFeeAuthorityId: authority.snapshotId,
          interestRateSnapshotIds: usedRateIds,
          fingerprint,
          trace: Object.freeze(trace),
        };
      }
      sum = sum.add(Money.from(rate.ratePercent, currency));
      usedRateIds.push(rate.snapshotId);
      trace.push({
        stage: 'INTEREST',
        detail: 'selic-month',
        values: { month, ratePercent: rate.ratePercent, snapshotId: rate.snapshotId },
      });
    }
    interestPercentage = sum.amount;
  } else {
    trace.push({ stage: 'INTEREST', detail: 'same-month-no-interest' });
  }
  const interestRaw = multiplyPercent(input.principalAmount, interestPercentage, currency);
  const interest = roundHalfEven(interestRaw, rule.moneyScale);
  trace.push({
    stage: 'INTEREST',
    detail: 'local-formula',
    values: { interestPercentage, rawAmount: interestRaw, roundedAmount: interest },
  });

  const updatedAmount = roundHalfEven(
    addDecimals(addDecimals(input.principalAmount, lateFee, currency), interest, currency),
    rule.moneyScale,
  );
  trace.push({
    stage: 'TOTAL',
    detail: 'component-first-sum',
    values: { principal: input.principalAmount, lateFee, interest, updatedAmount },
  });

  return {
    ...base,
    lateFeeAmount: lateFee,
    interestAmount: interest,
    updatedAmount,
    lateFeePercentage: penaltyPct,
    interestPercentage,
    daysLate,
    status: 'READY',
    reasonCode: null,
    lateFeeAuthorityId: authority.snapshotId,
    interestRateSnapshotIds: usedRateIds,
    fingerprint,
    trace: Object.freeze(trace),
  };
}

/** Inclusive calendar-day count between two civil dates (UTC-safe). */
export function daysBetweenInclusive(from: string, to: string): number {
  const a = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function computeAdjustmentFingerprint(input: {
  obligationFingerprint: string;
  principalAmount: string;
  dueDate: string;
  paymentDate: string;
  rule: LatePaymentRuleSet;
  lateFeeAuthority: OfficialLateFeeAuthority | null;
  interestRates: readonly OfficialInterestRate[];
}): string {
  const rates = [...input.interestRates]
    .map((r) => `${r.referenceMonth}:${r.ratePercent}:${r.version}`)
    .sort()
    .join(',');
  return [
    input.obligationFingerprint,
    input.principalAmount,
    input.dueDate,
    input.paymentDate,
    input.rule.ruleId,
    input.rule.version,
    input.rule.roundingMode,
    input.lateFeeAuthority
      ? `${input.lateFeeAuthority.snapshotId}:${input.lateFeeAuthority.version}`
      : 'none',
    rates,
  ].join('|');
}
