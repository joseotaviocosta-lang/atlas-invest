import { Money } from '@atlas/domain';

/**
 * Phase 4G.2A — Equity monthly tax core (pure domain).
 *
 * Implements the FROZEN legal semantics (research checkpoint 903f06d):
 *  - taxpayer/month-wide gross-sales exemption for normal equity operations
 *    (gross sales <= R$ 20.000,00 exempt; equality exempt);
 *  - day trade never uses the R$ 20k exemption;
 *  - separate normal / day-trade loss buckets, no cross-offset;
 *  - exempt profit does NOT consume prior normal loss by default;
 *  - exempt loss enters carryforward ONLY with an explicit persisted election
 *    (IN RFB 1.585/2015, art. 59, §1º).
 *
 * This module computes results and taxable bases BEFORE the 15%/20% rate and
 * BEFORE IRRF credit application (deferred to a later phase). Exact decimals
 * only — no IEEE-754.
 */
export const EQUITY_LOSS_CATEGORIES = ['EQUITY_NORMAL', 'EQUITY_DAY_TRADE'] as const;
export type EquityLossCategory = (typeof EQUITY_LOSS_CATEGORIES)[number];

export const EQUITY_MONTHLY_EXEMPTION_STATUSES = ['EXEMPT', 'TAXABLE', 'NOT_APPLICABLE'] as const;
export type EquityMonthlyExemptionStatus = (typeof EQUITY_MONTHLY_EXEMPTION_STATUSES)[number];

export const TAX_COMPENSATION_ELECTION_VALUES = [
  'DECLARE_FOR_CARRYFORWARD',
  'DO_NOT_DECLARE',
] as const;
export type TaxCompensationElectionValue = (typeof TAX_COMPENSATION_ELECTION_VALUES)[number];

export const TAX_COMPENSATION_ELECTION_TYPES = [
  'EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION',
] as const;
export type TaxCompensationElectionType = (typeof TAX_COMPENSATION_ELECTION_TYPES)[number];

export const EQUITY_ASSET_ELIGIBILITIES = [
  'ELIGIBLE_EQUITY',
  'UNSUPPORTED_ASSET',
  'UNKNOWN_CLASSIFICATION',
] as const;
export type EquityAssetEligibility = (typeof EQUITY_ASSET_ELIGIBILITIES)[number];

/** Exact-decimal threshold (R$ 20.000,00). */
export const EQUITY_MONTHLY_EXEMPTION_THRESHOLD = '20000';

export const EQUITY_MONTHLY_CORE_RULE_VERSION = 'equity-monthly-core-v1';

export interface EquitySellLeg {
  readonly legId: string;
  readonly assetId: string;
  readonly classification: 'NORMAL' | 'DAY_TRADE';
  /** Exact decimal string. */
  readonly quantity: string;
  /** Exact decimal string — gross sale proceeds. */
  readonly grossAmount: string;
  /** Exact decimal string — authoritative cost basis removed. */
  readonly costBasis: string;
  readonly assetEligibility: EquityAssetEligibility;
}

export interface EquityCategoryMonthlyResult {
  readonly category: EquityLossCategory;
  /** Exact decimal string. Normal: gross sales (threshold basis). Day trade: matched gross. */
  readonly grossSales: string;
  /** Exact decimal string; positive = gain, negative = loss. */
  readonly currentResult: string;
  readonly openingLoss: string;
  readonly lossAdded: string;
  readonly lossConsumed: string;
  readonly closingLoss: string;
  /** Exact decimal string; never negative. */
  readonly taxableBaseBeforeRate: string;
  readonly exemptionStatus: EquityMonthlyExemptionStatus;
  readonly electionStatus: 'NOT_REQUIRED' | 'ELECTION_REQUIRED' | 'DECLARED' | 'NOT_DECLARED';
}

export interface EquityMonthlyExemptionEvaluation {
  readonly taxSubjectId: string;
  readonly competence: string;
  readonly grossSalesAmount: string;
  readonly thresholdAmount: string;
  readonly status: EquityMonthlyExemptionStatus;
  readonly eligible: boolean;
  readonly ruleId: string;
  readonly ruleVersion: string;
}

export interface EquityMonthlyTaxCoreInput {
  readonly taxSubjectId: string;
  readonly competence: string;
  readonly sellLegs: readonly EquitySellLeg[];
  readonly openingNormalLoss: string;
  readonly openingDayTradeLoss: string;
  /** Effective election value for exempt-month loss recognition, if any. */
  readonly exemptLossElection?: TaxCompensationElectionValue;
}

export interface EquityMonthlyTaxCoreResult {
  readonly taxSubjectId: string;
  readonly competence: string;
  readonly normal: EquityCategoryMonthlyResult;
  readonly dayTrade: EquityCategoryMonthlyResult;
  readonly exemption: EquityMonthlyExemptionEvaluation;
  readonly overallStatus: 'COMPLETE' | 'PARTIAL' | 'BLOCKED';
  readonly reasonCode: string | null;
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

function isPositive(v: string): boolean {
  return Money.from(v, 'BRL').isPositive();
}

function isNegative(v: string): boolean {
  return Money.from(v, 'BRL').isNegative();
}

function minMoney(a: string, b: string): string {
  return Money.from(a, 'BRL').compare(Money.from(b, 'BRL')) <= 0 ? a : b;
}

function abs(v: string): string {
  return Money.from(v, 'BRL').abs().amount;
}

function buildCategory(
  category: EquityLossCategory,
  grossSales: string,
  currentResult: string,
  openingLoss: string,
  exemptionStatus: EquityMonthlyExemptionStatus,
  lossAdded: string,
  lossConsumed: string,
  closingLoss: string,
  taxableBase: string,
  electionStatus: EquityCategoryMonthlyResult['electionStatus'],
): EquityCategoryMonthlyResult {
  return Object.freeze({
    category,
    grossSales,
    currentResult,
    openingLoss,
    lossAdded,
    lossConsumed,
    closingLoss,
    taxableBaseBeforeRate: taxableBase,
    exemptionStatus,
    electionStatus,
  });
}

/**
 * Computes the monthly equity tax core. Deterministic, pure, replayable.
 */
export function computeEquityMonthlyTaxCore(
  input: EquityMonthlyTaxCoreInput,
): EquityMonthlyTaxCoreResult {
  const normalSells = input.sellLegs.filter(
    (leg) => leg.classification === 'NORMAL' && leg.assetEligibility === 'ELIGIBLE_EQUITY',
  );
  const dayTradeSells = input.sellLegs.filter(
    (leg) => leg.classification === 'DAY_TRADE' && leg.assetEligibility === 'ELIGIBLE_EQUITY',
  );
  const hasUnknown = input.sellLegs.some(
    (leg) => leg.assetEligibility === 'UNKNOWN_CLASSIFICATION',
  );

  const grossSales = normalSells.reduce((acc, leg) => add(acc, leg.grossAmount), zero());
  const normalResult = normalSells.reduce(
    (acc, leg) => add(acc, sub(leg.grossAmount, leg.costBasis)),
    zero(),
  );

  const dayTradeGross = dayTradeSells.reduce((acc, leg) => add(acc, leg.grossAmount), zero());
  const dayTradeResult = dayTradeSells.reduce(
    (acc, leg) => add(acc, sub(leg.grossAmount, leg.costBasis)),
    zero(),
  );

  const exempt =
    Money.from(grossSales, 'BRL').compare(Money.from(EQUITY_MONTHLY_EXEMPTION_THRESHOLD, 'BRL')) <=
    0;
  const exemptionStatus: EquityMonthlyExemptionStatus = exempt ? 'EXEMPT' : 'TAXABLE';

  // --- Normal category ---
  let normalElectionStatus: EquityCategoryMonthlyResult['electionStatus'] = 'NOT_REQUIRED';
  let normalLossAdded = zero();
  let normalLossConsumed = zero();
  let normalClosingLoss = Money.from(input.openingNormalLoss, 'BRL').amount;
  let normalTaxableBase = zero();

  if (exempt) {
    normalElectionStatus = 'NOT_REQUIRED';
    if (isPositive(normalResult)) {
      // Exempt gain: prior loss NOT consumed; taxable base 0.
      normalTaxableBase = zero();
    } else if (isNegative(normalResult)) {
      const loss = abs(normalResult);
      if (input.exemptLossElection === 'DECLARE_FOR_CARRYFORWARD') {
        normalLossAdded = loss;
        normalClosingLoss = add(input.openingNormalLoss, loss);
        normalElectionStatus = 'DECLARED';
      } else if (input.exemptLossElection === 'DO_NOT_DECLARE') {
        normalElectionStatus = 'NOT_DECLARED';
      } else {
        normalElectionStatus = 'ELECTION_REQUIRED';
      }
    }
  } else if (isPositive(normalResult)) {
    normalLossConsumed = minMoney(input.openingNormalLoss, normalResult);
    normalTaxableBase = sub(normalResult, normalLossConsumed);
    normalClosingLoss = sub(input.openingNormalLoss, normalLossConsumed);
  } else if (isNegative(normalResult)) {
    normalLossAdded = abs(normalResult);
    normalClosingLoss = add(input.openingNormalLoss, normalLossAdded);
  }

  // --- Day-trade category (never exempt; never cross-offset with normal) ---
  let dayTradeLossAdded = zero();
  let dayTradeLossConsumed = zero();
  let dayTradeClosingLoss = Money.from(input.openingDayTradeLoss, 'BRL').amount;
  let dayTradeTaxableBase = zero();
  if (isPositive(dayTradeResult)) {
    dayTradeLossConsumed = minMoney(input.openingDayTradeLoss, dayTradeResult);
    dayTradeTaxableBase = sub(dayTradeResult, dayTradeLossConsumed);
    dayTradeClosingLoss = sub(input.openingDayTradeLoss, dayTradeLossConsumed);
  } else if (isNegative(dayTradeResult)) {
    dayTradeLossAdded = abs(dayTradeResult);
    dayTradeClosingLoss = add(input.openingDayTradeLoss, dayTradeLossAdded);
  }

  const normal = buildCategory(
    'EQUITY_NORMAL',
    grossSales,
    normalResult,
    Money.from(input.openingNormalLoss, 'BRL').amount,
    exemptionStatus,
    normalLossAdded,
    normalLossConsumed,
    normalClosingLoss,
    normalTaxableBase,
    normalElectionStatus,
  );
  const dayTrade = buildCategory(
    'EQUITY_DAY_TRADE',
    dayTradeGross,
    dayTradeResult,
    Money.from(input.openingDayTradeLoss, 'BRL').amount,
    'NOT_APPLICABLE',
    dayTradeLossAdded,
    dayTradeLossConsumed,
    dayTradeClosingLoss,
    dayTradeTaxableBase,
    'NOT_REQUIRED',
  );

  const exemption: EquityMonthlyExemptionEvaluation = Object.freeze({
    taxSubjectId: input.taxSubjectId,
    competence: input.competence,
    grossSalesAmount: grossSales,
    thresholdAmount: EQUITY_MONTHLY_EXEMPTION_THRESHOLD,
    status: exemptionStatus,
    eligible: exempt,
    ruleId: 'BR-EQUITY-NORMAL-EXEMPTION-20K',
    ruleVersion: EQUITY_MONTHLY_CORE_RULE_VERSION,
  });

  const overallStatus = hasUnknown
    ? 'BLOCKED'
    : normalElectionStatus === 'ELECTION_REQUIRED'
      ? 'PARTIAL'
      : 'COMPLETE';
  const reasonCode = hasUnknown
    ? 'UNKNOWN_ASSET_TAX_CLASSIFICATION'
    : normalElectionStatus === 'ELECTION_REQUIRED'
      ? 'ELECTION_REQUIRED'
      : null;

  return Object.freeze({
    taxSubjectId: input.taxSubjectId,
    competence: input.competence,
    normal,
    dayTrade,
    exemption,
    overallStatus,
    reasonCode,
    ruleVersions: Object.freeze([EQUITY_MONTHLY_CORE_RULE_VERSION]),
  });
}

export interface TaxCompensationElection {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly competence: string;
  readonly electionType: TaxCompensationElectionType;
  readonly value: TaxCompensationElectionValue;
  readonly version: number;
  readonly source: 'MANUAL_CONFIRMED';
  readonly supersededById: string | null;
  readonly createdAt: string;
}

export function computeTaxCompensationElectionFingerprint(input: {
  readonly taxSubjectId: string;
  readonly competence: string;
  readonly electionType: TaxCompensationElectionType;
  readonly value: TaxCompensationElectionValue;
  readonly version: number;
}): string {
  return [
    input.taxSubjectId,
    input.competence,
    input.electionType,
    input.value,
    String(input.version),
  ].join('|');
}
