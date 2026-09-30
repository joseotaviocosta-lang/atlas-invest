import { Money } from '@atlas/domain';
import type { EquityLossCategory } from './equity-monthly-tax-core';

/**
 * Phase 4G.2B — Equity production tax rates & category-isolated IRRF credit pools
 * (pure domain).
 *
 * FROZEN legal semantics (research checkpoint 903f06d):
 *  - normal listed-equity gain: 15% (Lei 11.033/2004, art. 2º, II);
 *  - day-trade gain: 20% (Lei 11.033/2004, art. 2º, I);
 *  - normal IRRF: 0,005% (Lei 11.033/2004, art. 2º, §1º, IV; IN RFB 1.585/2015, art. 63);
 *  - day-trade IRRF: 1% (IN RFB 1.585/2015, art. 65, caput);
 *  - strict category segregation: normal IRRF never offsets day trade (nor FII),
 *    day-trade IRRF never offsets normal (nor FII);
 *  - residual year-end credit is terminal: normal → annual-adjustment state,
 *    day trade → restitution state; no automatic January carry.
 *
 * This module computes gross tax and category net tax BEFORE any 6015 federal
 * obligation aggregation (deferred to 4G.2C). Exact decimals only.
 */

export const EQUITY_TAX_RULE_IDS: Readonly<Record<EquityLossCategory, string>> = Object.freeze({
  EQUITY_NORMAL: 'BR-EQUITY-NORMAL',
  EQUITY_DAY_TRADE: 'BR-EQUITY-DAY-TRADE',
});

export const EQUITY_TAX_RULE_VERSION = '1.0.0';

/** Consolidated effective date of the frozen rule set (IN RFB 1.585/2015). */
export const EQUITY_TAX_RULE_EFFECTIVE_FROM = '2015-09-01';

export const EQUITY_TAX_RATE_PERCENTAGE: Readonly<Record<EquityLossCategory, string>> =
  Object.freeze({ EQUITY_NORMAL: '15', EQUITY_DAY_TRADE: '20' });

export const EQUITY_IRRF_RATE_PERCENTAGE: Readonly<Record<EquityLossCategory, string>> =
  Object.freeze({ EQUITY_NORMAL: '0.005', EQUITY_DAY_TRADE: '1' });

export const EQUITY_IRRF_POOL_IDS: Readonly<Record<EquityLossCategory, string>> = Object.freeze({
  EQUITY_NORMAL: 'EQUITY_NORMAL_IRRF',
  EQUITY_DAY_TRADE: 'EQUITY_DAY_TRADE_IRRF',
});

export type EquityIrrfYearEndState =
  'AVAILABLE_FOR_ANNUAL_ADJUSTMENT' | 'AVAILABLE_FOR_RESTITUTION';

export const EQUITY_IRRF_YEAR_END_STATE: Readonly<
  Record<EquityLossCategory, EquityIrrfYearEndState>
> = Object.freeze({
  EQUITY_NORMAL: 'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
  EQUITY_DAY_TRADE: 'AVAILABLE_FOR_RESTITUTION',
});

export const EQUITY_PRODUCTION_TAX_VERSION = 'equity-production-tax-v1';

export interface EquityProductionTaxRule {
  readonly id: string;
  readonly category: EquityLossCategory;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly ratePercentage: string;
  readonly irrfRatePercentage: string;
  readonly source: {
    readonly legalSourceId: string;
    readonly legalSourceReference: string;
  };
}

/**
 * Category-specific frozen production rules for equity. Kept separate from the
 * 4A/4B `TaxAssetCategory`-keyed registry so the existing FII rule and its
 * resolution path remain unchanged (equity sub-categories are not
 * `TaxAssetCategory` values).
 */
export const EQUITY_PRODUCTION_TAX_RULES: readonly EquityProductionTaxRule[] = Object.freeze([
  Object.freeze({
    id: EQUITY_TAX_RULE_IDS.EQUITY_NORMAL,
    category: 'EQUITY_NORMAL' as const,
    version: EQUITY_TAX_RULE_VERSION,
    effectiveFrom: EQUITY_TAX_RULE_EFFECTIVE_FROM,
    ratePercentage: EQUITY_TAX_RATE_PERCENTAGE.EQUITY_NORMAL,
    irrfRatePercentage: EQUITY_IRRF_RATE_PERCENTAGE.EQUITY_NORMAL,
    source: Object.freeze({
      legalSourceId: 'LEI-11033-2004-ART-2-II',
      legalSourceReference:
        'Lei nº 11.033/2004, art. 2º, II (15%); art. 2º, §1º, IV (IRRF 0,005%); IN RFB nº 1.585/2015, art. 63',
    }),
  }),
  Object.freeze({
    id: EQUITY_TAX_RULE_IDS.EQUITY_DAY_TRADE,
    category: 'EQUITY_DAY_TRADE' as const,
    version: EQUITY_TAX_RULE_VERSION,
    effectiveFrom: EQUITY_TAX_RULE_EFFECTIVE_FROM,
    ratePercentage: EQUITY_TAX_RATE_PERCENTAGE.EQUITY_DAY_TRADE,
    irrfRatePercentage: EQUITY_IRRF_RATE_PERCENTAGE.EQUITY_DAY_TRADE,
    source: Object.freeze({
      legalSourceId: 'LEI-11033-2004-ART-2-I',
      legalSourceReference:
        'Lei nº 11.033/2004, art. 2º, I (20%); IN RFB nº 1.585/2015, art. 65, caput (IRRF 1%)',
    }),
  }),
]);

/** Canonical equity IRRF withholding entry (category-explicit; never inferred). */
export interface EquityIrrfWithholdingEntry {
  readonly category: EquityLossCategory;
  /** Exact decimal string. */
  readonly amount: string;
  /** Stable identity for double-use protection (replaying the same entry never duplicates credit). */
  readonly fingerprint: string;
}

export interface EquityIrrfCategoryState {
  readonly category: EquityLossCategory;
  readonly poolId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly ratePercentage: string;
  readonly grossTax: string;
  readonly irrfOpening: string;
  readonly irrfCurrent: string;
  readonly irrfUsed: string;
  readonly irrfClosing: string;
  readonly netTaxBefore6015Aggregation: string;
  readonly yearEndState: EquityIrrfYearEndState | null;
}

export interface EquityProductionTaxMonthInput {
  readonly competence: string;
  readonly core: {
    readonly normal: { readonly taxableBaseBeforeRate: string };
    readonly dayTrade: { readonly taxableBaseBeforeRate: string };
  };
  readonly withholding: readonly EquityIrrfWithholdingEntry[];
}

export interface EquityProductionTaxMonthResult {
  readonly competence: string;
  readonly normal: EquityIrrfCategoryState;
  readonly dayTrade: EquityIrrfCategoryState;
  readonly ruleVersions: readonly string[];
}

function zero(): string {
  return Money.zero('BRL').amount;
}

function add(a: string, b: string): string {
  return Money.from(a, 'BRL').add(Money.from(b, 'BRL')).amount;
}

function sub(a: string, b: string): string {
  return Money.from(a, 'BRL').subtract(Money.from(b, 'BRL')).amount;
}

function minMoney(a: string, b: string): string {
  return Money.from(a, 'BRL').compare(Money.from(b, 'BRL')) <= 0 ? a : b;
}

/** Exact gross tax = base × rate%. No implicit rounding (display rounds to 2dp). */
function grossTax(base: string, ratePercentage: string): string {
  return Money.from(base, 'BRL').multiply(ratePercentage).divide('100').amount;
}

function isPositive(value: string): boolean {
  return Money.from(value, 'BRL').isPositive();
}

function yearOf(competence: string): string {
  return competence.slice(0, 4);
}

function isDecember(competence: string): boolean {
  return competence.slice(5, 7) === '12';
}

/** Deduplicated withholding totals per category (double-use protection by fingerprint). */
function dedupeWithholding(
  entries: readonly EquityIrrfWithholdingEntry[],
): Readonly<Record<EquityLossCategory, string>> {
  const seen = new Set<string>();
  const totals: Record<EquityLossCategory, string> = {
    EQUITY_NORMAL: zero(),
    EQUITY_DAY_TRADE: zero(),
  };
  for (const entry of entries) {
    if (seen.has(entry.fingerprint)) continue;
    seen.add(entry.fingerprint);
    totals[entry.category] = add(totals[entry.category], entry.amount);
  }
  return totals;
}

function applyCategory(input: {
  category: EquityLossCategory;
  competence: string;
  base: string;
  opening: string;
  current: string;
}): EquityIrrfCategoryState {
  const ratePercentage = EQUITY_TAX_RATE_PERCENTAGE[input.category];
  const tax = isPositive(input.base) ? grossTax(input.base, ratePercentage) : zero();
  return applyEquityIrrfCredit({
    category: input.category,
    competence: input.competence,
    grossTax: tax,
    opening: input.opening,
    current: input.current,
  });
}

/**
 * Applies category-isolated IRRF credit against a gross tax. Exported for exact
 * fixture-level testing and reuse. `used <= available`, `used <= grossTax`,
 * credit never negative, never crosses categories.
 */
export function applyEquityIrrfCredit(input: {
  readonly category: EquityLossCategory;
  readonly competence?: string;
  readonly grossTax: string;
  readonly opening: string;
  readonly current: string;
}): EquityIrrfCategoryState {
  const available = add(input.opening, input.current);
  const used = isPositive(input.grossTax) ? minMoney(available, input.grossTax) : zero();
  const closing = sub(available, used);
  const net = sub(input.grossTax, used);
  const terminal =
    input.competence !== undefined && isDecember(input.competence) && isPositive(closing);
  return Object.freeze({
    category: input.category,
    poolId: EQUITY_IRRF_POOL_IDS[input.category],
    ruleId: EQUITY_TAX_RULE_IDS[input.category],
    ruleVersion: EQUITY_TAX_RULE_VERSION,
    ratePercentage: EQUITY_TAX_RATE_PERCENTAGE[input.category],
    grossTax: input.grossTax,
    irrfOpening: input.opening,
    irrfCurrent: input.current,
    irrfUsed: used,
    irrfClosing: closing,
    netTaxBefore6015Aggregation: net,
    yearEndState: terminal ? EQUITY_IRRF_YEAR_END_STATE[input.category] : null,
  });
}

/**
 * Deterministic chronological replay of equity production tax and category IRRF
 * pools. Month M opening = month M-1 closing (never crosses categories, never
 * crosses a calendar year — the year boundary is terminal).
 */
export function replayEquityProductionTax(
  months: readonly EquityProductionTaxMonthInput[],
): readonly EquityProductionTaxMonthResult[] {
  const ordered = [...months].sort((a, b) => (a.competence < b.competence ? -1 : 1));
  const results: EquityProductionTaxMonthResult[] = [];
  let carryNormal = zero();
  let carryDayTrade = zero();
  let previousYear: string | null = null;

  for (const month of ordered) {
    const year = yearOf(month.competence);
    if (previousYear !== null && year !== previousYear) {
      // Year boundary: prior-year residual is terminal; monthly pools reset.
      carryNormal = zero();
      carryDayTrade = zero();
    }
    const withholding = dedupeWithholding(month.withholding);
    const normal = applyCategory({
      category: 'EQUITY_NORMAL',
      competence: month.competence,
      base: month.core.normal.taxableBaseBeforeRate,
      opening: carryNormal,
      current: withholding.EQUITY_NORMAL,
    });
    const dayTrade = applyCategory({
      category: 'EQUITY_DAY_TRADE',
      competence: month.competence,
      base: month.core.dayTrade.taxableBaseBeforeRate,
      opening: carryDayTrade,
      current: withholding.EQUITY_DAY_TRADE,
    });
    results.push(
      Object.freeze({
        competence: month.competence,
        normal,
        dayTrade,
        ruleVersions: Object.freeze([EQUITY_TAX_RULE_VERSION]),
      }),
    );
    // December residual is terminal → no carry into the next year.
    carryNormal = isDecember(month.competence) ? zero() : normal.irrfClosing;
    carryDayTrade = isDecember(month.competence) ? zero() : dayTrade.irrfClosing;
    previousYear = year;
  }

  return Object.freeze(results);
}

/** Single-month computation (no carry). */
export function computeEquityProductionTaxForMonth(
  input: EquityProductionTaxMonthInput,
): EquityProductionTaxMonthResult {
  const result = replayEquityProductionTax([input]);
  return result[0]!;
}
