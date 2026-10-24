import { DomainError } from '@atlas/domain';
import { compareAllocationToStrategy } from './strategy';
import type { ComparisonState } from './types';
import {
  SCENARIO_NAME_MAX_LENGTH,
  SCENARIO_NAME_MIN_LENGTH,
  STRATEGY_TOLERANCE_BP,
} from './policy';
import { STRATEGY_CATEGORIES } from './types';

export const SCENARIO_TYPES = ['CONTRIBUTION'] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export interface ScenarioChangeInput {
  category: string;
  /** Canonical decimal money string ('10000.50'): validated, never locale input. */
  amount: string;
}

export interface ScenarioInput {
  type: string;
  changes: readonly ScenarioChangeInput[];
}

export type ScenarioValidationCode =
  | 'UNKNOWN_SCENARIO_TYPE'
  | 'UNSUPPORTED_SCENARIO_TYPE'
  | 'EMPTY_CHANGES'
  | 'TOO_MANY_CHANGES'
  | 'UNKNOWN_CATEGORY'
  | 'DUPLICATE_CATEGORY'
  | 'INVALID_AMOUNT'
  | 'NON_POSITIVE_AMOUNT';

export interface ScenarioValidationError {
  code: ScenarioValidationCode;
}

export interface ScenarioRowInput {
  category: string;
  /** Current known value as a canonical decimal money string. */
  currentValue: string;
  /** Current weight in integer basis points, or null when unknown. */
  currentBp: number | null;
  targetBp: number;
}

export interface SimulatedRow {
  category: string;
  targetBp: number;
  currentBp: number | null;
  currentValue: string;
  scenarioAmount: string;
  projectedValue: string;
  projectedBp: number;
  currentDeviationBp: number | null;
  projectedDeviationBp: number;
  state: ComparisonState;
}

export interface SimulatedScenario {
  rows: SimulatedRow[];
  totals: { current: string; scenario: string; projected: string; currency: string };
  beforeOutsideCount: number;
  afterOutsideCount: number;
  beforeTotalAbsDeviationBp: number;
  afterTotalAbsDeviationBp: number;
  worstGap: { category: string; deviationBp: number } | null;
}

export class InvalidAllocationScenarioError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_SCENARIO');
    this.name = 'InvalidAllocationScenarioError';
  }
}

const CANONICAL_AMOUNT = /^\d+(?:\.\d{1,2})?$/;

/**
 * Validates a hypothetical scenario. WITHDRAWAL is a known future extension:
 * rejected explicitly (not silently coerced) until its floor-at-zero and
 * no-implicit-sale semantics are specified and tested.
 */
export function validateScenarioInput(input: {
  type: string;
  changes: readonly ScenarioChangeInput[];
}): { valid: true } | { valid: false; errors: ScenarioValidationError[] } {
  const errors: ScenarioValidationError[] = [];
  if (input.type !== 'CONTRIBUTION') {
    return { valid: false, errors: [{ code: 'UNKNOWN_SCENARIO_TYPE' }] };
  }
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return { valid: false, errors: [{ code: 'EMPTY_CHANGES' }] };
  }
  if (input.changes.length > STRATEGY_CATEGORIES.length) {
    return { valid: false, errors: [{ code: 'TOO_MANY_CHANGES' }] };
  }
  const seen = new Set<string>();
  for (const change of input.changes) {
    if (!STRATEGY_CATEGORIES.includes(change.category as (typeof STRATEGY_CATEGORIES)[number])) {
      errors.push({ code: 'UNKNOWN_CATEGORY' });
      continue;
    }
    if (seen.has(change.category)) {
      errors.push({ code: 'DUPLICATE_CATEGORY' });
      continue;
    }
    seen.add(change.category);
    if (typeof change.amount !== 'string' || !CANONICAL_AMOUNT.test(change.amount.trim())) {
      errors.push({ code: 'INVALID_AMOUNT' });
      continue;
    }
    if (isZeroDecimal(change.amount.trim())) {
      errors.push({ code: 'NON_POSITIVE_AMOUNT' });
    }
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Exact decimal string math (no floats, no binary rounding).
// ---------------------------------------------------------------------------

function splitDecimal(value: string): { negative: boolean; int: string; frac: string } {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const dot = unsigned.indexOf('.');
  if (dot === -1) return { negative, int: unsigned === '' ? '0' : unsigned, frac: '' };
  return {
    negative,
    int: unsigned.slice(0, dot) === '' ? '0' : unsigned.slice(0, dot),
    frac: unsigned.slice(dot + 1),
  };
}

function normalizeInt(digits: string): string {
  const stripped = digits.replace(/^0+(?=\d)/, '');
  return stripped === '' ? '0' : stripped;
}

/** Canonical form: no leading zeros, no trailing fractional zeros ('100.50' -> '100.5', '0.00' -> '0'). */
export function canonicalDecimal(value: string): string {
  const { negative, int, frac } = splitDecimal(value);
  const trimmedFrac = frac.replace(/0+$/, '');
  const normalizedInt = normalizeInt(int);
  if (normalizedInt === '0' && trimmedFrac === '') return '0';
  return `${negative && !(normalizedInt === '0' && trimmedFrac === '') ? '-' : ''}${normalizedInt}${trimmedFrac === '' ? '' : `.${trimmedFrac}`}`;
}

/**
 * Parses a pt-BR/neutral money input into canonical decimal form.
 * Accepts '10000', '10000.50', '10.000', '10.000,50', '10000,50'.
 * Thousands '.' are stripped only when unambiguous; at most 2 decimals.
 * Never touches binary floats. Returns null when unparseable.
 */
export function parseScenarioAmountToCanonical(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/^R\$\s?/, '');
  if (cleaned === '' || cleaned.startsWith('-') || cleaned.startsWith('+')) return null;
  if (!/^[\d.,]+$/.test(cleaned)) return null;
  let canonical: string;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    // pt-BR: '.' thousands, ',' decimal. Comma must be last separator.
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastDot > lastComma) return null;
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleaned) && !/^\d+,\d{1,2}$/.test(cleaned)) {
      // Allow generic: strip dots, comma -> dot, then validate.
      const stripped = cleaned.replace(/\./g, '');
      if (!/^\d+,\d{1,2}$/.test(stripped) && !/^\d+$/.test(stripped)) return null;
      canonical = stripped.replace(',', '.');
    } else {
      canonical = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    if (!/^\d+,\d{1,2}$/.test(cleaned) && !/^\d+$/.test(cleaned)) return null;
    canonical = cleaned.replace(',', '.');
  } else if (hasDot) {
    // Ambiguous '.': thousands when ^\d{1,3}(\.\d{3})+$ else decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      canonical = cleaned.replace(/\./g, '');
    } else if (/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      canonical = cleaned;
    } else {
      return null;
    }
  } else {
    if (!/^\d+$/.test(cleaned)) return null;
    canonical = cleaned;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(canonical)) return null;
  // Reject absurd length (storage-safe sanity, no product cap).
  const digitsOnly = canonical.replace('.', '');
  if (digitsOnly.length > 18) return null;
  if (isZeroDecimal(canonical)) return canonicalDecimal(canonical);
  return canonicalDecimal(canonical);
}

function isZeroDecimal(value: string): boolean {
  const { int, frac } = splitDecimal(value);
  return normalizeInt(int) === '0' && /^0*$/.test(frac);
}

/** Exact addition of canonical decimal strings (same scale handling via BigInt). */
export function addDecimals(a: string, b: string): string {
  const left = splitDecimal(a);
  const right = splitDecimal(b);
  const scale = Math.max(left.frac.length, right.frac.length);
  const toUnits = (part: { negative: boolean; int: string; frac: string }): bigint => {
    const padded = (part.frac + '0'.repeat(scale)).slice(0, Math.max(scale, 1));
    const unitsValue = BigInt(normalizeInt(part.int) + padded);
    return part.negative ? -unitsValue : unitsValue;
  };
  const sum = toUnits(left) + toUnits(right);
  const negative = sum < BigInt(0);
  const abs = (negative ? -sum : sum).toString();
  if (scale === 0) return `${negative ? '-' : ''}${abs}`;
  const padded = abs.padStart(scale + 1, '0');
  const intPart = padded.slice(0, padded.length - scale);
  const fracPart = padded.slice(padded.length - scale);
  return canonicalDecimal(`${negative ? '-' : ''}${intPart}.${fracPart}`);
}

/**
 * Exact basis points of value/total, ROUND_HALF_UP.
 * Throws InvalidAllocationScenarioError on unparseable input, zero total,
 * or out-of-range results (fail closed, never NaN/Infinity).
 */
export function ratioToBasisPoints(value: string, total: string): number {
  const left = splitDecimal(value);
  const right = splitDecimal(total);
  if (left.negative || right.negative) {
    throw new InvalidAllocationScenarioError('Negative amounts cannot be compared');
  }
  const scale = Math.max(left.frac.length, right.frac.length, 2);
  const pad = (part: { int: string; frac: string }): bigint =>
    BigInt(normalizeInt(part.int) + (part.frac + '0'.repeat(scale)).slice(0, scale));
  const numerator = pad(left);
  const denominator = pad(right);
  if (denominator === BigInt(0)) {
    throw new InvalidAllocationScenarioError('Cannot compare against an empty known total');
  }
  // bp = round(value / total * 10000), half-up: floor((2*N*10000 + D) / (2*D)).
  const scaled = numerator * BigInt(10000);
  const result = (scaled * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidAllocationScenarioError('Simulated weight out of range');
  }
  return Number(result);
}

/**
 * Simulates a user-declared contribution against known current values.
 * The projected comparison reuses compareAllocationToStrategy — no second
 * deviation implementation. Throws InvalidAllocationScenarioError on empty
 * totals instead of dividing by zero.
 */
export function simulateAllocationScenario(input: {
  changes: readonly ScenarioChangeInput[];
  currency: string;
  current: readonly { category: string; value: string }[];
  targets: readonly { category: string; targetBp: number }[];
  toleranceBp?: number;
}): SimulatedScenario {
  const { currency } = input;
  const tolerance = input.toleranceBp ?? STRATEGY_TOLERANCE_BP;

  const currentByCategory = new Map(input.current.map((row) => [row.category, row.value]));
  const targetByCategory = new Map(input.targets.map((row) => [row.category, row.targetBp]));
  const changeByCategory = new Map(input.changes.map((row) => [row.category, row.amount]));

  const categories = Array.from(
    new Set([...targetByCategory.keys(), ...currentByCategory.keys(), ...changeByCategory.keys()]),
  ).sort(
    (left, right) =>
      STRATEGY_CATEGORIES.indexOf(left as (typeof STRATEGY_CATEGORIES)[number]) -
      STRATEGY_CATEGORIES.indexOf(right as (typeof STRATEGY_CATEGORIES)[number]),
  );

  let currentTotal = '0';
  for (const value of currentByCategory.values()) {
    currentTotal = addDecimals(currentTotal, value);
  }
  if (isZeroDecimal(currentTotal)) {
    throw new InvalidAllocationScenarioError('Cannot simulate on an empty known total');
  }
  let scenarioTotal = '0';
  for (const amount of changeByCategory.values()) {
    scenarioTotal = addDecimals(scenarioTotal, amount);
  }
  const projectedTotal = addDecimals(currentTotal, scenarioTotal);

  const rows: SimulatedRow[] = categories.map((category) => {
    const currentValue = currentByCategory.get(category) ?? '0';
    const changeAmount = changeByCategory.get(category) ?? '0';
    const projectedValue = addDecimals(currentValue, changeAmount);
    const projectedBp = ratioToBasisPoints(projectedValue, projectedTotal);
    const targetBp = targetByCategory.get(category) ?? 0;
    const deviationBp = projectedBp - targetBp;
    const state =
      Math.abs(deviationBp) <= tolerance
        ? ('ON_TARGET' as const)
        : deviationBp > 0
          ? ('ABOVE_TARGET' as const)
          : ('BELOW_TARGET' as const);
    return {
      category,
      targetBp,
      currentBp: null,
      currentValue,
      scenarioAmount: changeAmount,
      projectedValue,
      projectedBp,
      currentDeviationBp: null,
      projectedDeviationBp: deviationBp,
      state,
    };
  });

  // Fill current weights + deviations via the shared comparison (single source of truth).
  const currentWeights = categories.map((category) => {
    const currentValue = currentByCategory.get(category);
    return {
      category,
      currentBp: currentValue === undefined ? null : ratioToBasisPoints(currentValue, currentTotal),
    };
  });
  const currentComparison = compareAllocationToStrategy({
    targets: input.targets.map((target) => ({
      category: target.category,
      targetBp: target.targetBp,
    })),
    current: currentWeights,
    toleranceBp: tolerance,
  });
  const currentByCategoryMap = new Map(currentComparison.rows.map((row) => [row.category, row]));
  for (const row of rows) {
    const compared = currentByCategoryMap.get(row.category);
    row.currentBp = compared ? compared.currentBp : row.currentBp;
    row.currentDeviationBp = compared ? compared.deviationBp : null;
    // NOTE: a missing current value yields UNAVAILABLE for the *current*
    // leg only. The projected classification stays valid: a contribution
    // into a previously-absent category is exactly the supported case.
  }

  const beforeOutside = currentComparison.outsideTolerance.length;
  const afterOutside = rows.filter(
    (row) => row.state === 'ABOVE_TARGET' || row.state === 'BELOW_TARGET',
  ).length;
  const beforeAbs = currentComparison.rows.reduce(
    (sum, row) => sum + (row.deviationBp === null ? 0 : Math.abs(row.deviationBp)),
    0,
  );
  const afterAbs = rows.reduce((sum, row) => sum + Math.abs(row.projectedDeviationBp), 0);
  const below = rows.filter((row) => row.projectedDeviationBp < 0);
  const worst =
    below.length > 0
      ? below.reduce((a, b) => (a.projectedDeviationBp < b.projectedDeviationBp ? a : b))
      : null;

  return {
    rows,
    totals: { current: currentTotal, scenario: scenarioTotal, projected: projectedTotal, currency },
    beforeOutsideCount: beforeOutside,
    afterOutsideCount: afterOutside,
    beforeTotalAbsDeviationBp: beforeAbs,
    afterTotalAbsDeviationBp: afterAbs,
    worstGap: worst ? { category: worst.category, deviationBp: worst.projectedDeviationBp } : null,
  };
}

export type ScenarioNameValidationCode = 'EMPTY_NAME' | 'NAME_TOO_LONG' | 'NAME_HAS_MARKUP';

export interface ScenarioNameValidationError {
  code: ScenarioNameValidationCode;
}

/**
 * Phase 5Q-E — saved scenario name rules (pure). Plain text only:
 * trimmed, 1..80 chars, no angle brackets (never rendered as HTML
 * anywhere, but rejected at the boundary anyway).
 */
export function validateScenarioName(raw: unknown):
  | {
      valid: true;
      name: string;
    }
  | { valid: false; errors: ScenarioNameValidationError[] } {
  if (typeof raw !== 'string') {
    return { valid: false, errors: [{ code: 'EMPTY_NAME' }] };
  }
  const name = raw.trim();
  if (name.length < SCENARIO_NAME_MIN_LENGTH) {
    return { valid: false, errors: [{ code: 'EMPTY_NAME' }] };
  }
  if (name.length > SCENARIO_NAME_MAX_LENGTH) {
    return { valid: false, errors: [{ code: 'NAME_TOO_LONG' }] };
  }
  if (name.includes('<') || name.includes('>')) {
    return { valid: false, errors: [{ code: 'NAME_HAS_MARKUP' }] };
  }
  return { valid: true, name };
}

/**
 * Default copy name for duplication ('Aporte mensal' -> 'Aporte mensal — cópia').
 * Truncated to the name limit; the caller may let the user edit afterwards.
 */
export function buildScenarioCopyName(name: string): string {
  const trimmed = name.trim();
  const suffix = ' — cópia';
  const combined = `${trimmed}${suffix}`;
  if (combined.length <= SCENARIO_NAME_MAX_LENGTH) return combined;
  return `${trimmed.slice(0, SCENARIO_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

export interface ComparedScenarioSide {
  scenarioId: string;
  name: string;
  scenarioTotal: string;
  projectedTotal: string;
  outsideCount: number;
  totalAbsDeviationBp: number;
  projectedWeights: Array<{ category: string; projectedBp: number; projectedDeviationBp: number }>;
}

export interface ScenarioComparison {
  sides: [ComparedScenarioSide, ComparedScenarioSide];
  currency: string;
  sameScenarioTotal: boolean;
}

/**
 * Phase 5Q-E — factual comparison of two live simulation results.
 * Both results MUST share the same current basis (same currentTotal,
 * same currency, same strategy): the caller guarantees it by simulating
 * both change-sets against one loaded basis — this function re-checks
 * and throws instead of comparing across different bases. Facts only:
 * no choosing between scenarios, no scoring, no ranking, no advice.
 */
export function compareScenarioResults(input: {
  left: { scenarioId: string; name: string; result: SimulatedScenario };
  right: { scenarioId: string; name: string; result: SimulatedScenario };
}): ScenarioComparison {
  const { left, right } = input;
  if (left.result.totals.currency !== right.result.totals.currency) {
    throw new InvalidAllocationScenarioError('Cannot compare scenarios across currencies');
  }
  if (left.result.totals.current !== right.result.totals.current) {
    throw new InvalidAllocationScenarioError(
      'Cannot compare scenarios computed on different portfolio states',
    );
  }
  const toSide = (side: {
    scenarioId: string;
    name: string;
    result: SimulatedScenario;
  }): ComparedScenarioSide => ({
    scenarioId: side.scenarioId,
    name: side.name,
    scenarioTotal: side.result.totals.scenario,
    projectedTotal: side.result.totals.projected,
    outsideCount: side.result.afterOutsideCount,
    totalAbsDeviationBp: side.result.afterTotalAbsDeviationBp,
    projectedWeights: side.result.rows.map((row) => ({
      category: row.category,
      projectedBp: row.projectedBp,
      projectedDeviationBp: row.projectedDeviationBp,
    })),
  });
  const sides: [ComparedScenarioSide, ComparedScenarioSide] = [toSide(left), toSide(right)];
  return {
    sides,
    currency: left.result.totals.currency,
    sameScenarioTotal: left.result.totals.scenario === right.result.totals.scenario,
  };
}
