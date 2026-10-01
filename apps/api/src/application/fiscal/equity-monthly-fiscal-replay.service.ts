import { Money } from '@atlas/domain';
import type { Transaction } from '@atlas/domain';
import {
  EQUITY_MONTHLY_EXEMPTION_THRESHOLD,
  EQUITY_TAX_RATE_PERCENTAGE,
  EQUITY_TAX_RULE_IDS,
  EQUITY_TAX_RULE_VERSION,
  EquityTradeClassificationError,
  applyEquityIrrfCredit,
  classifyEquityTradesForTax,
  computeEquityMonthlyTaxCore,
  resolveTaxAssetCategory,
  type CanonicalRealizedResult,
  type EquityAssetEligibility,
  type EquityExecution,
  type EquityIrrfCategoryState,
  type EquityIrrfWithholdingEntry,
  type EquityIrrfYearEndState,
  type EquityLossCategory,
  type EquityMonthlyTaxCoreResult,
  type EquitySellLeg,
  type EquityTaxLeg,
  type TaxCompensationElectionValue,
} from '@atlas/tax-engine';

/** Current persisted election snapshot for a competence. */
export interface EquityElectionSnapshot {
  readonly value: TaxCompensationElectionValue;
  readonly version: number;
  readonly fingerprint: string;
}

export interface EquityMonthlyReplayInput {
  readonly taxSubjectId: string;
  readonly requestedCompetence: string;
  readonly transactions: readonly Transaction[];
  readonly assetTypeByAssetId: ReadonlyMap<string, string>;
  readonly institutionByAccountId: ReadonlyMap<string, string>;
  readonly canonicalRealizedByTransactionId: ReadonlyMap<string, CanonicalRealizedResult>;
  readonly electionByCompetence: ReadonlyMap<string, EquityElectionSnapshot>;
  /** Canonical equity IRRF evidence per competence (explicit category, never inferred). */
  readonly withholdingByCompetence?: ReadonlyMap<string, readonly EquityIrrfWithholdingEntry[]>;
  /** Competences blocked by missing/ambiguous equity withholding classification. */
  readonly blockedWithholdingByCompetence?: ReadonlySet<string>;
}

export interface EquityCategoryReadModel {
  readonly status: string;
  readonly reasonCode: string | null;
  readonly grossSales: string;
  readonly threshold: string | null;
  readonly exemptionStatus: string;
  readonly matchedQuantity: string | null;
  readonly currentResult: string;
  readonly openingLoss: string;
  readonly lossAdded: string;
  readonly lossConsumed: string;
  readonly closingLoss: string;
  readonly taxableBaseBeforeRate: string;
  readonly electionStatus: string;
  readonly taxRate: string;
  readonly grossTax: string;
  readonly irrfOpening: string;
  readonly irrfCurrent: string;
  readonly irrfUsed: string;
  readonly irrfClosing: string;
  readonly irrfTerminalStatus: EquityIrrfYearEndState | null;
  readonly netTaxBefore6015Aggregation: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
}

export interface EquityCompensationElectionReadModel {
  readonly required: boolean;
  readonly status: string;
  readonly currentValue: TaxCompensationElectionValue | null;
  readonly version: number | null;
  readonly fingerprint: string | null;
}

export interface EquityMonthlyFiscalReadModel {
  readonly competence: string;
  readonly status: 'COMPLETE' | 'PARTIAL' | 'BLOCKED';
  readonly reasonCode: string | null;
  readonly normal: EquityCategoryReadModel;
  readonly dayTrade: EquityCategoryReadModel;
  readonly compensationElection: EquityCompensationElectionReadModel;
  readonly ruleVersions: readonly string[];
}

function competenceOf(tradeDate: string): string {
  return tradeDate.slice(0, 7);
}

function yearOf(competence: string): string {
  return competence.slice(0, 4);
}

function isDecember(competence: string): boolean {
  return competence.slice(5, 7) === '12';
}

/** Exact gross tax = base × rate%. */
function grossTaxFor(base: string, category: EquityLossCategory): string {
  if (!Money.from(base, 'BRL').isPositive()) return Money.zero('BRL').amount;
  return Money.from(base, 'BRL').multiply(EQUITY_TAX_RATE_PERCENTAGE[category]).divide('100')
    .amount;
}

function sumWithholding(
  entries: readonly EquityIrrfWithholdingEntry[],
  category: EquityLossCategory,
): string {
  let total = Money.zero('BRL');
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.category !== category) continue;
    // Double-use protection: the same evidence fingerprint is credited once.
    if (seen.has(entry.fingerprint)) continue;
    seen.add(entry.fingerprint);
    total = total.add(Money.from(entry.amount, 'BRL'));
  }
  return total.amount;
}

function irrfForMonth(input: {
  category: EquityLossCategory;
  competence: string;
  base: string;
  opening: string;
  withholding: readonly EquityIrrfWithholdingEntry[];
}): EquityIrrfCategoryState {
  return applyEquityIrrfCredit({
    category: input.category,
    competence: input.competence,
    grossTax: grossTaxFor(input.base, input.category),
    opening: input.opening,
    current: sumWithholding(input.withholding, input.category),
  });
}

function eligibilityOf(assetType: string | undefined): EquityAssetEligibility {
  const category = resolveTaxAssetCategory(assetType);
  if (category === 'BRAZILIAN_EQUITY') return 'ELIGIBLE_EQUITY';
  if (category === 'UNKNOWN') return 'UNKNOWN_CLASSIFICATION';
  return 'UNSUPPORTED_ASSET';
}

interface Candidate {
  readonly transactionId: string;
  readonly assetId: string;
  readonly accountId: string;
  readonly institutionId: string | undefined;
  readonly tradeDate: string;
  readonly createdAtMs: number;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly unitPrice: string;
  readonly eligibility: EquityAssetEligibility;
}

function isTrade(tx: Transaction): tx is Transaction & {
  type: 'BUY' | 'SELL';
  assetId: string;
  quantity: { toString(): string };
  unitPrice: { amount: string };
} {
  return (
    (tx.type === 'BUY' || tx.type === 'SELL') &&
    'assetId' in tx &&
    Boolean((tx as { assetId?: string }).assetId) &&
    'quantity' in tx &&
    'unitPrice' in tx
  );
}

function buildCandidates(input: EquityMonthlyReplayInput): Candidate[] {
  const candidates: Candidate[] = [];
  for (const tx of input.transactions) {
    if (!isTrade(tx)) continue;
    const assetId = String(tx.assetId);
    candidates.push({
      transactionId: String(tx.id),
      assetId,
      accountId: String(tx.accountId),
      institutionId: input.institutionByAccountId.get(String(tx.accountId)),
      tradeDate: tx.tradeDate.toString(),
      createdAtMs: tx.createdAt.getTime(),
      side: tx.type,
      quantity: tx.quantity.toString(),
      unitPrice: tx.unitPrice.amount,
      eligibility: eligibilityOf(input.assetTypeByAssetId.get(assetId)),
    });
  }
  return candidates;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1;
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0;
}

interface SellLegBuild {
  readonly leg: EquitySellLeg;
  readonly competence: string;
}

/**
 * Phase 4G.2A.1b.1 — deterministic equity monthly fiscal replay from the real
 * ledger. Pure: no I/O, no Prisma, no network. Reuses the frozen day-trade
 * matcher and the frozen monthly core. Cost basis is authoritative (normal:
 * canonical realized disposal prorated by quantity; day trade: matched buy leg).
 * Fails closed on unknown assets, missing institution, missing ordering and
 * missing cost basis.
 */
export function computeEquityMonthlyFiscalRead(
  input: EquityMonthlyReplayInput,
): EquityMonthlyFiscalReadModel {
  const candidates = buildCandidates(input);

  const blockByCompetence = new Map<string, string>();
  const unknownCompetences = new Set<string>();
  const matchedQuantityByCompetence = new Map<string, string>();

  const executions: EquityExecution[] = [];
  const sellTxQuantity = new Map<string, string>();
  const eligibleSells = new Set<string>();

  const eligible = candidates.filter((c) => c.eligibility === 'ELIGIBLE_EQUITY');
  eligible.sort(compareCandidates);

  eligible.forEach((candidate, index) => {
    if (!candidate.institutionId) {
      blockByCompetence.set(competenceOf(candidate.tradeDate), 'MISSING_INSTITUTION_IDENTITY');
      return;
    }
    executions.push({
      transactionId: candidate.transactionId,
      assetId: candidate.assetId,
      institutionId: candidate.institutionId,
      tradeDate: candidate.tradeDate,
      side: candidate.side,
      quantity: candidate.quantity,
      unitPrice: candidate.unitPrice,
      sequence: index,
    });
    if (candidate.side === 'SELL') {
      sellTxQuantity.set(candidate.transactionId, candidate.quantity);
      eligibleSells.add(candidate.transactionId);
    }
  });

  for (const candidate of candidates) {
    if (candidate.eligibility === 'UNKNOWN_CLASSIFICATION') {
      unknownCompetences.add(competenceOf(candidate.tradeDate));
    }
  }

  let legsByCompetence = new Map<string, EquitySellLeg[]>();
  try {
    const classification = classifyEquityTradesForTax(executions);
    const built = buildSellLegs(classification.legs, input, sellTxQuantity, blockByCompetence);
    legsByCompetence = groupByCompetence(built, matchedQuantityByCompetence);
  } catch (error) {
    if (error instanceof EquityTradeClassificationError) {
      return blockedReadModel(input.requestedCompetence, 'EQUITY_MATCHER_FAILED');
    }
    throw error;
  }

  // Unknown-classification sells are surfaced as legs so the frozen core blocks.
  for (const candidate of candidates) {
    if (candidate.eligibility === 'UNKNOWN_CLASSIFICATION' && candidate.side === 'SELL') {
      const competence = competenceOf(candidate.tradeDate);
      const list = legsByCompetence.get(competence) ?? [];
      list.push({
        legId: `unknown:${candidate.transactionId}`,
        assetId: candidate.assetId,
        classification: 'NORMAL',
        quantity: candidate.quantity,
        grossAmount: Money.from(candidate.quantity, 'BRL').multiply(candidate.unitPrice).amount,
        costBasis: Money.zero('BRL').amount,
        assetEligibility: 'UNKNOWN_CLASSIFICATION',
      });
      legsByCompetence.set(competence, list);
    }
  }

  const competences = new Set<string>([input.requestedCompetence]);
  for (const key of legsByCompetence.keys())
    if (key <= input.requestedCompetence) competences.add(key);
  for (const key of blockByCompetence.keys())
    if (key <= input.requestedCompetence) competences.add(key);
  for (const key of unknownCompetences) if (key <= input.requestedCompetence) competences.add(key);
  for (const key of input.withholdingByCompetence?.keys() ?? []) {
    if (key <= input.requestedCompetence) competences.add(key);
  }
  for (const key of input.blockedWithholdingByCompetence ?? []) {
    if (key <= input.requestedCompetence) competences.add(key);
  }
  const ordered = [...competences].sort();

  let carryNormal = Money.zero('BRL').amount;
  let carryDayTrade = Money.zero('BRL').amount;
  let carryNormalIrrf = Money.zero('BRL').amount;
  let carryDayTradeIrrf = Money.zero('BRL').amount;
  let previousYear: string | null = null;
  let priorBlocked = false;
  let requestedCore: EquityMonthlyTaxCoreResult | null = null;
  let requestedBlockReason: string | null = null;
  let requestedMatchedQuantity = '0';
  let requestedNormalIrrf: EquityIrrfCategoryState | null = null;
  let requestedDayTradeIrrf: EquityIrrfCategoryState | null = null;

  for (const competence of ordered) {
    const year = yearOf(competence);
    if (previousYear !== null && year !== previousYear) {
      carryNormalIrrf = Money.zero('BRL').amount;
      carryDayTradeIrrf = Money.zero('BRL').amount;
    }
    previousYear = year;

    const directBlock = blockByCompetence.get(competence) ?? null;
    const unknownBlock = unknownCompetences.has(competence)
      ? 'UNKNOWN_ASSET_TAX_CLASSIFICATION'
      : null;
    const withholdingBlock = input.blockedWithholdingByCompetence?.has(competence)
      ? 'INCOMPLETE_WITHHOLDING_CLASSIFICATION'
      : null;
    const ownReason = directBlock ?? unknownBlock ?? withholdingBlock;
    if (priorBlocked) {
      if (competence === input.requestedCompetence) {
        requestedBlockReason = ownReason ?? 'PRIOR_COMPETENCE_BLOCKED';
      }
      continue;
    }
    const legs = legsByCompetence.get(competence) ?? [];
    const core = computeEquityMonthlyTaxCore({
      taxSubjectId: input.taxSubjectId,
      competence,
      sellLegs: legs,
      openingNormalLoss: carryNormal,
      openingDayTradeLoss: carryDayTrade,
      ...(input.electionByCompetence.get(competence)
        ? { exemptLossElection: input.electionByCompetence.get(competence)!.value }
        : {}),
    });
    const blockReason = ownReason ?? (core.overallStatus === 'BLOCKED' ? core.reasonCode : null);
    if (competence === input.requestedCompetence) {
      requestedCore = core;
      requestedBlockReason = blockReason;
      requestedMatchedQuantity = matchedQuantityByCompetence.get(competence) ?? '0';
    }
    if (blockReason) {
      priorBlocked = true;
      continue;
    }
    const withholding = input.withholdingByCompetence?.get(competence) ?? [];
    const normalIrrf = irrfForMonth({
      category: 'EQUITY_NORMAL',
      competence,
      base: core.normal.taxableBaseBeforeRate,
      opening: carryNormalIrrf,
      withholding,
    });
    const dayTradeIrrf = irrfForMonth({
      category: 'EQUITY_DAY_TRADE',
      competence,
      base: core.dayTrade.taxableBaseBeforeRate,
      opening: carryDayTradeIrrf,
      withholding,
    });
    if (competence === input.requestedCompetence) {
      requestedNormalIrrf = normalIrrf;
      requestedDayTradeIrrf = dayTradeIrrf;
    }
    carryNormal = core.normal.closingLoss;
    carryDayTrade = core.dayTrade.closingLoss;
    // December residual IRRF is terminal → no carry into the next calendar year.
    carryNormalIrrf = isDecember(competence) ? Money.zero('BRL').amount : normalIrrf.irrfClosing;
    carryDayTradeIrrf = isDecember(competence)
      ? Money.zero('BRL').amount
      : dayTradeIrrf.irrfClosing;
  }

  if (!requestedCore) {
    // No equity activity at the requested competence: stable empty/zero model.
    requestedCore = computeEquityMonthlyTaxCore({
      taxSubjectId: input.taxSubjectId,
      competence: input.requestedCompetence,
      sellLegs: [],
      openingNormalLoss: Money.zero('BRL').amount,
      openingDayTradeLoss: Money.zero('BRL').amount,
    });
  }
  if (!requestedNormalIrrf || !requestedDayTradeIrrf) {
    const withholding = input.withholdingByCompetence?.get(input.requestedCompetence) ?? [];
    requestedNormalIrrf = irrfForMonth({
      category: 'EQUITY_NORMAL',
      competence: input.requestedCompetence,
      base: requestedCore.normal.taxableBaseBeforeRate,
      opening: Money.zero('BRL').amount,
      withholding,
    });
    requestedDayTradeIrrf = irrfForMonth({
      category: 'EQUITY_DAY_TRADE',
      competence: input.requestedCompetence,
      base: requestedCore.dayTrade.taxableBaseBeforeRate,
      opening: Money.zero('BRL').amount,
      withholding,
    });
  }

  return toReadModel(
    input.requestedCompetence,
    requestedCore,
    requestedBlockReason,
    requestedMatchedQuantity,
    input.electionByCompetence.get(input.requestedCompetence) ?? null,
    requestedNormalIrrf,
    requestedDayTradeIrrf,
  );
}

function buildSellLegs(
  legs: readonly EquityTaxLeg[],
  input: EquityMonthlyReplayInput,
  sellTxQuantity: ReadonlyMap<string, string>,
  blockByCompetence: Map<string, string>,
): SellLegBuild[] {
  const pendingDayTradeBuys = new Map<string, EquityTaxLeg[]>();
  const built: SellLegBuild[] = [];

  for (const leg of legs) {
    const groupKey = `${leg.assetId}|${leg.institutionId}|${leg.tradeDate}`;
    if (leg.classification === 'DAY_TRADE') {
      if (leg.side === 'BUY') {
        const queue = pendingDayTradeBuys.get(groupKey) ?? [];
        queue.push(leg);
        pendingDayTradeBuys.set(groupKey, queue);
      } else {
        const queue = pendingDayTradeBuys.get(groupKey) ?? [];
        const matchedBuy = queue.shift();
        pendingDayTradeBuys.set(groupKey, queue);
        const costBasis = matchedBuy ? matchedBuy.grossAmount : Money.zero('BRL').amount;
        built.push({
          competence: competenceOf(leg.tradeDate),
          leg: {
            legId: leg.legId,
            assetId: leg.assetId,
            classification: 'DAY_TRADE',
            quantity: leg.quantity,
            grossAmount: leg.grossAmount,
            costBasis,
            assetEligibility: 'ELIGIBLE_EQUITY',
          },
        });
      }
      continue;
    }

    if (leg.side !== 'SELL') continue;
    const competence = competenceOf(leg.tradeDate);
    const totalQuantity = sellTxQuantity.get(leg.sourceTransactionId);
    const canonical = input.canonicalRealizedByTransactionId.get(leg.sourceTransactionId);
    let costBasis = Money.zero('BRL').amount;
    if (
      !canonical ||
      canonical.status !== 'KNOWN' ||
      !canonical.costBasisRemoved ||
      !totalQuantity
    ) {
      blockByCompetence.set(competence, 'MISSING_CANONICAL_COST_BASIS');
    } else {
      costBasis = Money.from(canonical.costBasisRemoved, 'BRL')
        .multiply(leg.quantity)
        .divide(totalQuantity).amount;
    }
    built.push({
      competence,
      leg: {
        legId: leg.legId,
        assetId: leg.assetId,
        classification: 'NORMAL',
        quantity: leg.quantity,
        grossAmount: leg.grossAmount,
        costBasis,
        assetEligibility: 'ELIGIBLE_EQUITY',
      },
    });
  }
  return built;
}

function groupByCompetence(
  built: readonly SellLegBuild[],
  matchedQuantityByCompetence: Map<string, string>,
): Map<string, EquitySellLeg[]> {
  const byCompetence = new Map<string, EquitySellLeg[]>();
  for (const { competence, leg } of built) {
    const list = byCompetence.get(competence) ?? [];
    list.push(leg);
    byCompetence.set(competence, list);
    if (leg.classification === 'DAY_TRADE') {
      matchedQuantityByCompetence.set(
        competence,
        Money.from(matchedQuantityByCompetence.get(competence) ?? '0', 'BRL').add(
          Money.from(leg.quantity, 'BRL'),
        ).amount,
      );
    }
  }
  return byCompetence;
}

function blockedReadModel(competence: string, reasonCode: string): EquityMonthlyFiscalReadModel {
  const zero = Money.zero('BRL').amount;
  const blockedCategory = (
    category: EquityLossCategory,
    matched: string | null,
  ): EquityCategoryReadModel => ({
    status: 'BLOCKED',
    reasonCode,
    grossSales: zero,
    threshold: category === 'EQUITY_NORMAL' ? EQUITY_MONTHLY_EXEMPTION_THRESHOLD : null,
    exemptionStatus: 'NOT_APPLICABLE',
    matchedQuantity: matched,
    currentResult: zero,
    openingLoss: zero,
    lossAdded: zero,
    lossConsumed: zero,
    closingLoss: zero,
    taxableBaseBeforeRate: zero,
    electionStatus: 'NOT_REQUIRED',
    taxRate: EQUITY_TAX_RATE_PERCENTAGE[category],
    grossTax: zero,
    irrfOpening: zero,
    irrfCurrent: zero,
    irrfUsed: zero,
    irrfClosing: zero,
    irrfTerminalStatus: null,
    netTaxBefore6015Aggregation: zero,
    ruleId: EQUITY_TAX_RULE_IDS[category],
    ruleVersion: EQUITY_TAX_RULE_VERSION,
  });
  return {
    competence,
    status: 'BLOCKED',
    reasonCode,
    normal: blockedCategory('EQUITY_NORMAL', null),
    dayTrade: blockedCategory('EQUITY_DAY_TRADE', '0'),
    compensationElection: {
      required: false,
      status: 'NOT_REQUIRED',
      currentValue: null,
      version: null,
      fingerprint: null,
    },
    ruleVersions: [],
  };
}

function toReadModel(
  competence: string,
  core: EquityMonthlyTaxCoreResult,
  blockReason: string | null,
  matchedQuantity: string,
  election: EquityElectionSnapshot | null,
  normalIrrf: EquityIrrfCategoryState,
  dayTradeIrrf: EquityIrrfCategoryState,
): EquityMonthlyFiscalReadModel {
  const blocked = blockReason !== null;
  const status: EquityMonthlyFiscalReadModel['status'] = blocked ? 'BLOCKED' : core.overallStatus;
  const reasonCode = blocked ? blockReason : core.reasonCode;
  const zero = Money.zero('BRL').amount;

  const category = (
    source: EquityMonthlyTaxCoreResult['normal'],
    matched: string | null,
    irrf: EquityIrrfCategoryState,
  ): EquityCategoryReadModel => ({
    status,
    reasonCode,
    grossSales: source.grossSales,
    threshold: matched === null ? EQUITY_MONTHLY_EXEMPTION_THRESHOLD : null,
    exemptionStatus: blocked ? 'NOT_APPLICABLE' : source.exemptionStatus,
    matchedQuantity: matched,
    currentResult: source.currentResult,
    openingLoss: source.openingLoss,
    lossAdded: source.lossAdded,
    lossConsumed: source.lossConsumed,
    closingLoss: source.closingLoss,
    taxableBaseBeforeRate: source.taxableBaseBeforeRate,
    electionStatus: source.electionStatus,
    taxRate: irrf.ratePercentage,
    // A blocked month never presents an authoritative tax/IRRF conclusion.
    grossTax: blocked ? zero : irrf.grossTax,
    irrfOpening: blocked ? zero : irrf.irrfOpening,
    irrfCurrent: blocked ? zero : irrf.irrfCurrent,
    irrfUsed: blocked ? zero : irrf.irrfUsed,
    irrfClosing: blocked ? zero : irrf.irrfClosing,
    irrfTerminalStatus: blocked ? null : irrf.yearEndState,
    netTaxBefore6015Aggregation: blocked ? zero : irrf.netTaxBefore6015Aggregation,
    ruleId: irrf.ruleId,
    ruleVersion: irrf.ruleVersion,
  });

  const electionStatus = core.normal.electionStatus;
  return {
    competence,
    status,
    reasonCode,
    normal: category(core.normal, null, normalIrrf),
    dayTrade: category(core.dayTrade, matchedQuantity, dayTradeIrrf),
    compensationElection: {
      required: electionStatus === 'ELECTION_REQUIRED',
      status: electionStatus,
      currentValue: election?.value ?? null,
      version: election?.version ?? null,
      fingerprint: election?.fingerprint ?? null,
    },
    ruleVersions: core.ruleVersions,
  };
}
