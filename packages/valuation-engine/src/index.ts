import { Currency, Money, Percentage, Quantity, assertValidCurrency } from '@atlas/domain';

export const VALUATION_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const VALUATION_STATUSES = [
  'VALUED',
  'QUOTE_UNAVAILABLE',
  'QUOTE_STALE',
  'COST_INCOMPLETE',
  'CURRENCY_MISMATCH',
  'UNSUPPORTED_ASSET',
] as const;
export type ValuationStatus = (typeof VALUATION_STATUSES)[number];

export const VALUATION_COMPLETENESSES = [
  'COMPLETE',
  'PARTIAL_QUOTES',
  'PARTIAL_COST',
  'PARTIAL_CURRENCY',
  'PARTIAL_STALE',
  'PARTIAL_MULTIPLE',
] as const;
export type ValuationCompleteness = (typeof VALUATION_COMPLETENESSES)[number];

export const QUOTE_FRESHNESSES = ['FRESH', 'STALE', 'UNKNOWN'] as const;
export type QuoteFreshness = (typeof QUOTE_FRESHNESSES)[number];

export const QUOTE_STATUSES = ['LIVE', 'DELAYED', 'EOD', 'STALE', 'UNAVAILABLE'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface ValuationQuote {
  assetId: string;
  price: string;
  currency: Currency;
  asOf: string;
  receivedAt: string;
  marketTime?: string;
  source: string;
  status: QuoteStatus;
  freshness: QuoteFreshness;
  providerSymbol: string;
}

export interface PositionValuationInput {
  assetId: string;
  accountId: string | null;
  ticker?: string;
  assetType?: string;
  quantity: string;
  currency: Currency;
  totalCost: string | null;
  averageCost: string | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface MoneyJSON {
  amount: string;
  currency: Currency;
}

export interface PositionValuation {
  assetId: string;
  accountId: string | null;
  ticker?: string;
  assetType?: string;
  quantity: string;
  currency: Currency;
  totalCost: MoneyJSON | null;
  averageCost: MoneyJSON | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  quote: ValuationQuote | null;
  marketValue: MoneyJSON | null;
  unrealizedGainLoss: MoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  status: ValuationStatus;
  quoteFreshness: QuoteFreshness | null;
  quoteStatus: QuoteStatus | null;
}

export interface AccountValuation {
  accountId: string;
  positions: PositionValuation[];
  totalsByCurrency: Record<string, CurrencyValuationTotals>;
  valuedPositionsCount: number;
  unavailablePositionsCount: number;
  stalePositionsCount: number;
  incompleteCostPositionsCount: number;
  mismatchPositionsCount: number;
}

export interface CurrencyValuationTotals {
  currency: Currency;
  marketValue: MoneyJSON;
  costBasis: MoneyJSON;
  knownCost: MoneyJSON;
  unrealizedGainLoss: MoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  valuedPositionsCount: number;
  unvaluedPositionsCount: number;
  stalePositionsCount: number;
}

export interface TranslatedValuationRateInfo {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rate: string;
  rateDate: string;
  source: string;
  isInverted: boolean;
}

export interface TranslatedValuationSummary {
  reportingCurrency: Currency;
  totalMarketValue: MoneyJSON;
  totalCostBasis: MoneyJSON;
  totalUnrealizedGainLoss: MoneyJSON | null;
  totalUnrealizedGainLossPercent: string | null;
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  ratesUsed: Record<string, TranslatedValuationRateInfo>;
  untranslatedCurrencies: Currency[];
}

export interface PortfolioValuation {
  portfolioId: string;
  asOf: string | null;
  engineVersion: string;
  valuationVersion: string;
  positions: PositionValuation[];
  accounts: AccountValuation[];
  totalsByCurrency: Record<string, CurrencyValuationTotals>;
  translatedSummary?: TranslatedValuationSummary;
  completeness: ValuationCompleteness;
  summary: {
    totalPositions: number;
    valuedPositions: number;
    unvaluedPositions: number;
    unavailablePositions: number;
    incompleteCostPositions: number;
    stalePositions: number;
    mismatchPositions: number;
    valuationCoveragePercent: string;
    currencies: Currency[];
  };
  quoteSummary: {
    totalQuotesRequested: number;
    quotesAvailable: number;
    quotesUnavailable: number;
    quotesStale: number;
  };
}

// ---------------------------------------------------------------------------
// Pure valuation logic
// ---------------------------------------------------------------------------

/**
 * Values a single position given a quote (or null).
 * Pure, deterministic, zero float.
 *
 * status priority:
 * 1. QUOTE_UNAVAILABLE if quote null
 * 2. CURRENCY_MISMATCH if quote currency != position currency
 * 3. QUOTE_STALE if quote.freshness === 'STALE' (still values, but stale)
 * 4. COST_INCOMPLETE if costBasisStatus INCOMPLETE (marketValue still valued)
 * 5. VALUED otherwise
 */
export function valuePosition(
  input: PositionValuationInput,
  quote: ValuationQuote | null,
): PositionValuation {
  const quantity = input.quantity;
  const currency = assertValidCurrency(input.currency);
  const costBasisStatus = input.costBasisStatus;

  // Validate quantity is positive (positions are long-only)
  // If quantity is zero, position would not exist, but handle gracefully

  // Serialize cost
  let totalCostJson: MoneyJSON | null = null;
  let averageCostJson: MoneyJSON | null = null;
  if (input.totalCost !== null && costBasisStatus === 'KNOWN') {
    totalCostJson = { amount: input.totalCost, currency };
  }
  if (input.averageCost !== null && costBasisStatus === 'KNOWN') {
    averageCostJson = { amount: input.averageCost, currency };
  }

  // No quote
  if (!quote) {
    return Object.freeze({
      assetId: input.assetId,
      accountId: input.accountId,
      ...(input.ticker ? { ticker: input.ticker } : {}),
      ...(input.assetType ? { assetType: input.assetType } : {}),
      quantity,
      currency,
      totalCost: totalCostJson,
      averageCost: averageCostJson,
      costBasisStatus,
      quote: null,
      marketValue: null,
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'QUOTE_UNAVAILABLE' as ValuationStatus,
      quoteFreshness: null,
      quoteStatus: null,
    });
  }

  // Currency mismatch — never convert
  const quoteCurrency = assertValidCurrency(quote.currency);
  if (quoteCurrency !== currency) {
    return Object.freeze({
      assetId: input.assetId,
      accountId: input.accountId,
      ...(input.ticker ? { ticker: input.ticker } : {}),
      ...(input.assetType ? { assetType: input.assetType } : {}),
      quantity,
      currency,
      totalCost: totalCostJson,
      averageCost: averageCostJson,
      costBasisStatus,
      quote,
      marketValue: null,
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'CURRENCY_MISMATCH' as ValuationStatus,
      quoteFreshness: quote.freshness,
      quoteStatus: quote.status,
    });
  }

  // Compute marketValue: quantity × quote.price (exact)
  let marketValue: Money | null = null;
  let marketValueJson: MoneyJSON | null = null;
  try {
    const qty = Quantity.from(quantity);
    const priceMoney = Money.from(quote.price, quoteCurrency);
    marketValue = priceMoney.multiply(qty.value);
    marketValueJson = { amount: marketValue.amount, currency: marketValue.currency };
  } catch {
    // If quantity or price invalid, treat as unavailable
    return Object.freeze({
      assetId: input.assetId,
      accountId: input.accountId,
      ...(input.ticker ? { ticker: input.ticker } : {}),
      ...(input.assetType ? { assetType: input.assetType } : {}),
      quantity,
      currency,
      totalCost: totalCostJson,
      averageCost: averageCostJson,
      costBasisStatus,
      quote,
      marketValue: null,
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'QUOTE_UNAVAILABLE' as ValuationStatus,
      quoteFreshness: quote.freshness,
      quoteStatus: quote.status,
    });
  }

  const isStale = quote.freshness === 'STALE' || quote.status === 'STALE';

  // Cost incomplete → marketValue exists but unrealized null
  if (costBasisStatus === 'INCOMPLETE' || totalCostJson === null) {
    return Object.freeze({
      assetId: input.assetId,
      accountId: input.accountId,
      ...(input.ticker ? { ticker: input.ticker } : {}),
      ...(input.assetType ? { assetType: input.assetType } : {}),
      quantity,
      currency,
      totalCost: null,
      averageCost: null,
      costBasisStatus,
      quote,
      marketValue: marketValueJson,
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: isStale ? ('QUOTE_STALE' as ValuationStatus) : ('COST_INCOMPLETE' as ValuationStatus),
      quoteFreshness: quote.freshness,
      quoteStatus: quote.status,
    });
  }

  // Cost known → compute unrealized
  let unrealized: Money | null = null;
  let unrealizedJson: MoneyJSON | null = null;
  let percent: string | null = null;

  try {
    const costMoney = Money.from(totalCostJson!.amount, totalCostJson!.currency);
    unrealized = marketValue!.subtract(costMoney);
    unrealizedJson = { amount: unrealized.amount, currency: unrealized.currency };

    // Percent only if cost > 0
    if (!costMoney.isZero()) {
      const unrealizedDec = unrealized.amount;
      // unrealized / cost * 100
      const costVal = costMoney.amount;
      // Use Percentage via Money division: (unrealized / cost) * 100
      // We can compute via Decimal directly using Money/Quantity primitives
      // Use costMoney.divide for Money? No, Money divide by scalar.
      // We need: percent = (unrealized.amount / cost.amount) * 100
      // Use DecimalValue via Quantity to avoid float
      // Simpler: use Percentage.from with string computation via DecimalValue
      // But we don't have DecimalValue exposed; use Money arithmetic workaround:
      // Create Quantity from amounts and compute.
      const unrealizedQty = Quantity.from(unrealizedDec);
      const costQty = Quantity.from(costVal);
      const ratio = unrealizedQty.divide(costQty); // unrealized / cost
      const percentQty = ratio.multiply(Quantity.from('100'));
      const pct = Percentage.from(percentQty.value);
      percent = pct.value;
    } else {
      percent = null;
    }
  } catch {
    unrealizedJson = null;
    percent = null;
  }

  return Object.freeze({
    assetId: input.assetId,
    accountId: input.accountId,
    ...(input.ticker ? { ticker: input.ticker } : {}),
    ...(input.assetType ? { assetType: input.assetType } : {}),
    quantity,
    currency,
    totalCost: totalCostJson,
    averageCost: averageCostJson,
    costBasisStatus,
    quote,
    marketValue: marketValueJson,
    unrealizedGainLoss: unrealizedJson,
    unrealizedGainLossPercent: percent,
    status: isStale ? ('QUOTE_STALE' as ValuationStatus) : ('VALUED' as ValuationStatus),
    quoteFreshness: quote.freshness,
    quoteStatus: quote.status,
  });
}

function sumMoneyByCurrency(
  valuations: PositionValuation[],
  filter: (v: PositionValuation) => boolean,
  getMoney: (v: PositionValuation) => MoneyJSON | null,
): Map<Currency, Money> {
  const sums = new Map<Currency, Money>();
  for (const v of valuations) {
    if (!filter(v)) continue;
    const mj = getMoney(v);
    if (!mj) continue;
    const cur = mj.currency as Currency;
    const m = Money.from(mj.amount, mj.currency);
    const existing = sums.get(cur);
    if (existing) {
      sums.set(cur, existing.add(m));
    } else {
      sums.set(cur, m);
    }
  }
  return sums;
}

function computeTotals(valuations: PositionValuation[]): Record<string, CurrencyValuationTotals> {
  // Group by currency from marketValue or cost
  const currencies = new Set<Currency>();
  for (const v of valuations) {
    currencies.add(v.currency);
    if (v.quote) currencies.add(v.quote.currency as Currency);
  }

  const result: Record<string, CurrencyValuationTotals> = {};

  for (const cur of currencies) {
    // Positions in this currency
    const inCurrency = valuations.filter((v) => v.currency === cur);
    if (inCurrency.length === 0) continue;

    // MarketValue sum: where marketValue != null and marketValue.currency === cur
    const mvMap = sumMoneyByCurrency(
      inCurrency,
      (v) => v.marketValue !== null && v.marketValue.currency === cur,
      (v) => v.marketValue,
    );
    const mv = mvMap.get(cur);
    if (!mv) continue; // no valued positions in this currency, skip totals

    // KnownCost sum: where totalCost != null and currency matches and marketValue exists (per spec, only valued)
    const costMap = sumMoneyByCurrency(
      inCurrency,
      (v) => v.totalCost !== null && v.totalCost.currency === cur && v.marketValue !== null,
      (v) => v.totalCost,
    );
    const cost = costMap.get(cur) ?? Money.zero(cur);

    // Unrealized sum: where unrealizedGainLoss != null and currency matches
    const unrealMap = sumMoneyByCurrency(
      inCurrency,
      (v) => v.unrealizedGainLoss !== null && v.unrealizedGainLoss.currency === cur,
      (v) => v.unrealizedGainLoss,
    );
    const unreal = unrealMap.get(cur) ?? null;

    const hasKnownCost = inCurrency.some((v) => v.totalCost !== null && v.marketValue !== null);
    const knownCostJson: MoneyJSON = cost
      ? { amount: cost.amount, currency: cost.currency }
      : { amount: Money.zero(cur).amount, currency: cur };

    // Percent for totals: totalUnrealized / totalKnownCost * 100 if knownCost > 0
    let totalPercent: string | null = null;
    if (unreal && !cost.isZero() && hasKnownCost) {
      try {
        const unrealQty = Quantity.from(unreal.amount);
        const costQty = Quantity.from(cost.amount);
        const ratio = unrealQty.divide(costQty);
        const percentQty = ratio.multiply(Quantity.from('100'));
        totalPercent = Percentage.from(percentQty.value).value;
      } catch {
        totalPercent = null;
      }
    } else if (unreal && cost.isZero()) {
      totalPercent = null;
    }

    const valuedCount = inCurrency.filter((v) => v.marketValue !== null).length;
    const unvaluedCount = inCurrency.length - valuedCount;
    const staleCount = inCurrency.filter((v) => v.status === 'QUOTE_STALE').length;

    result[cur] = Object.freeze({
      currency: cur,
      marketValue: { amount: mv.amount, currency: mv.currency },
      costBasis: knownCostJson,
      knownCost: knownCostJson,
      unrealizedGainLoss: unreal ? { amount: unreal.amount, currency: unreal.currency } : null,
      unrealizedGainLossPercent: totalPercent,
      valuedPositionsCount: valuedCount,
      unvaluedPositionsCount: unvaluedCount,
      stalePositionsCount: staleCount,
    });
  }

  return Object.freeze(result) as Record<string, CurrencyValuationTotals>;
}

function determineCompleteness(vals: PositionValuation[]): ValuationCompleteness {
  let hasUnavailable = false;
  let hasIncomplete = false;
  let hasMismatch = false;
  let hasStale = false;

  for (const v of vals) {
    if (v.status === 'QUOTE_UNAVAILABLE') hasUnavailable = true;
    if (v.status === 'COST_INCOMPLETE') hasIncomplete = true;
    if (v.status === 'CURRENCY_MISMATCH') hasMismatch = true;
    if (v.status === 'QUOTE_STALE') hasStale = true;
    // VALUED is complete
  }

  const flags = [hasUnavailable, hasIncomplete, hasMismatch, hasStale].filter(Boolean).length;
  if (flags === 0) return 'COMPLETE';
  if (flags > 1) return 'PARTIAL_MULTIPLE';
  if (hasUnavailable) return 'PARTIAL_QUOTES';
  if (hasIncomplete) return 'PARTIAL_COST';
  if (hasMismatch) return 'PARTIAL_CURRENCY';
  if (hasStale) return 'PARTIAL_STALE';
  return 'PARTIAL_MULTIPLE';
}

export interface ValuationFxRate {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rate: string;
  rateDate: string;
  source: string;
  isInverted?: boolean;
}

export interface PortfolioValuationInput {
  portfolioId: string;
  asOf?: string | null;
  positions: PositionValuationInput[];
  accountPositions: Map<string, PositionValuationInput[]>;
  quotes: Map<string, ValuationQuote>;
  reportingCurrency?: Currency;
  fxRates?: Map<string, ValuationFxRate>;
}

export function valuePortfolio(input: PortfolioValuationInput): PortfolioValuation {
  const { portfolioId, positions, accountPositions, quotes } = input;

  // Value consolidated positions
  const consolidatedValuations: PositionValuation[] = positions
    .map((p) => {
      const q = quotes.get(p.assetId) ?? null;
      return valuePosition(p, q);
    })
    .sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)));

  // Value per-account
  const accountValuations: AccountValuation[] = [];
  for (const [accountId, posList] of accountPositions.entries()) {
    const vals = posList
      .map((p) => {
        const q = quotes.get(p.assetId) ?? null;
        return valuePosition(p, q);
      })
      .sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)));

    const totals = computeTotals(vals);
    const valued = vals.filter((v) => v.marketValue !== null).length;
    const unavailable = vals.filter((v) => v.status === 'QUOTE_UNAVAILABLE').length;
    const stale = vals.filter((v) => v.status === 'QUOTE_STALE').length;
    const incomplete = vals.filter((v) => v.status === 'COST_INCOMPLETE').length;
    const mismatch = vals.filter((v) => v.status === 'CURRENCY_MISMATCH').length;

    accountValuations.push(
      Object.freeze({
        accountId,
        positions: Object.freeze(vals) as PositionValuation[],
        totalsByCurrency: totals,
        valuedPositionsCount: valued,
        unavailablePositionsCount: unavailable,
        stalePositionsCount: stale,
        incompleteCostPositionsCount: incomplete,
        mismatchPositionsCount: mismatch,
      }),
    );
  }
  accountValuations.sort((a, b) => String(a.accountId).localeCompare(String(b.accountId)));

  const totalsByCurrency = computeTotals(consolidatedValuations);
  const completeness = determineCompleteness(consolidatedValuations);

  const totalPositions = consolidatedValuations.length;
  const valuedPositions = consolidatedValuations.filter((v) => v.marketValue !== null).length;
  const unavailablePositions = consolidatedValuations.filter(
    (v) => v.status === 'QUOTE_UNAVAILABLE',
  ).length;
  const incompleteCostPositions = consolidatedValuations.filter(
    (v) => v.status === 'COST_INCOMPLETE',
  ).length;
  const stalePositions = consolidatedValuations.filter((v) => v.status === 'QUOTE_STALE').length;
  const mismatchPositions = consolidatedValuations.filter(
    (v) => v.status === 'CURRENCY_MISMATCH',
  ).length;

  const unvaluedPositions = totalPositions - valuedPositions;
  let valuationCoveragePercent = '0';
  if (totalPositions > 0) {
    try {
      const valuedQty = Quantity.from(String(valuedPositions));
      const totalQty = Quantity.from(String(totalPositions));
      const ratio = valuedQty.divide(totalQty);
      const pct = ratio.multiply(Quantity.from('100'));
      valuationCoveragePercent = Percentage.from(pct.value).value;
    } catch {
      valuationCoveragePercent = '0';
    }
  }

  const currencies = Object.keys(totalsByCurrency) as Currency[];

  const quotesAvailable = consolidatedValuations.filter((v) => v.quote !== null).length;
  const quotesUnavailable = totalPositions - quotesAvailable;
  const quotesStale = consolidatedValuations.filter((v) => v.quoteFreshness === 'STALE').length;

  // Multi-Currency Translation (Phase 5C)
  let translatedSummary: TranslatedValuationSummary | undefined = undefined;
  const reportingCurrency: Currency =
    input.reportingCurrency ?? currencies[0] ?? ('BRL' as Currency);

  if (currencies.length > 0) {
    let sumMv = Money.zero(reportingCurrency);
    let sumCost = Money.zero(reportingCurrency);
    let sumUnreal = Money.zero(reportingCurrency);
    let hasAnyUnreal = false;
    let translationStatus: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' = 'AVAILABLE';
    const ratesUsed: Record<string, TranslatedValuationRateInfo> = {};
    const untranslatedCurrencies: Currency[] = [];

    for (const cur of currencies) {
      const curTotals = totalsByCurrency[cur];
      if (!curTotals) continue;

      if (cur === reportingCurrency) {
        sumMv = sumMv.add(Money.from(curTotals.marketValue.amount, reportingCurrency));
        sumCost = sumCost.add(Money.from(curTotals.knownCost.amount, reportingCurrency));
        if (curTotals.unrealizedGainLoss) {
          sumUnreal = sumUnreal.add(
            Money.from(curTotals.unrealizedGainLoss.amount, reportingCurrency),
          );
          hasAnyUnreal = true;
        }
        continue;
      }

      // Foreign currency requires FX rate (e.g., baseCurrency: USD, quoteCurrency: BRL)
      const pairKey = `${cur}::${reportingCurrency}`;
      const fxRate = input.fxRates?.get(pairKey);

      if (!fxRate) {
        translationStatus = 'PARTIAL';
        untranslatedCurrencies.push(cur);
        continue;
      }

      try {
        const rateQty = Quantity.from(fxRate.rate);

        // Convert market value: curMv × rate
        const curMvQty = Quantity.from(curTotals.marketValue.amount);
        const translatedMvQty = curMvQty.multiply(rateQty);
        sumMv = sumMv.add(Money.from(translatedMvQty.value, reportingCurrency));

        // Convert cost basis: curCost × rate
        const curCostQty = Quantity.from(curTotals.knownCost.amount);
        const translatedCostQty = curCostQty.multiply(rateQty);
        sumCost = sumCost.add(Money.from(translatedCostQty.value, reportingCurrency));

        // Convert unrealized gain/loss if present
        if (curTotals.unrealizedGainLoss) {
          const curUnrealQty = Quantity.from(curTotals.unrealizedGainLoss.amount);
          const translatedUnrealQty = curUnrealQty.multiply(rateQty);
          sumUnreal = sumUnreal.add(Money.from(translatedUnrealQty.value, reportingCurrency));
          hasAnyUnreal = true;
        }

        ratesUsed[pairKey] = {
          baseCurrency: fxRate.baseCurrency,
          quoteCurrency: fxRate.quoteCurrency,
          rate: fxRate.rate,
          rateDate: fxRate.rateDate,
          source: fxRate.source,
          isInverted: fxRate.isInverted ?? false,
        };
      } catch {
        translationStatus = 'PARTIAL';
        untranslatedCurrencies.push(cur);
      }
    }

    if (untranslatedCurrencies.length === currencies.length && currencies.length > 1) {
      translationStatus = 'UNAVAILABLE';
    }

    let translatedPercent: string | null = null;
    if (hasAnyUnreal && !sumCost.isZero()) {
      try {
        const unrealQty = Quantity.from(sumUnreal.amount);
        const costQty = Quantity.from(sumCost.amount);
        const ratio = unrealQty.divide(costQty);
        const pct = ratio.multiply(Quantity.from('100'));
        translatedPercent = Percentage.from(pct.value).value;
      } catch {
        translatedPercent = null;
      }
    }

    translatedSummary = Object.freeze({
      reportingCurrency,
      totalMarketValue: { amount: sumMv.amount, currency: reportingCurrency },
      totalCostBasis: { amount: sumCost.amount, currency: reportingCurrency },
      totalUnrealizedGainLoss: hasAnyUnreal
        ? { amount: sumUnreal.amount, currency: reportingCurrency }
        : null,
      totalUnrealizedGainLossPercent: translatedPercent,
      status: translationStatus,
      ratesUsed: Object.freeze(ratesUsed),
      untranslatedCurrencies: Object.freeze(untranslatedCurrencies) as Currency[],
    });
  }

  return Object.freeze({
    portfolioId,
    asOf: input.asOf ?? null,
    engineVersion: '1.0.0-rc.1',
    valuationVersion: VALUATION_VERSION,
    positions: Object.freeze(consolidatedValuations) as PositionValuation[],
    accounts: Object.freeze(accountValuations) as AccountValuation[],
    totalsByCurrency,
    ...(translatedSummary ? { translatedSummary } : {}),
    completeness,
    summary: Object.freeze({
      totalPositions,
      valuedPositions,
      unvaluedPositions,
      unavailablePositions,
      incompleteCostPositions,
      stalePositions,
      mismatchPositions,
      valuationCoveragePercent,
      currencies,
    }),
    quoteSummary: Object.freeze({
      totalQuotesRequested: totalPositions,
      quotesAvailable,
      quotesUnavailable,
      quotesStale,
    }),
  });
}

// ---------------------------------------------------------------------------
// Allocation Read Model (Phase 5A-I2)
// ---------------------------------------------------------------------------

export interface AssetAllocationItem {
  assetId: string;
  ticker?: string;
  assetType?: string;
  currency: Currency;
  marketValue: MoneyJSON;
  allocationPercent: string;
  quoteFreshness: QuoteFreshness | null;
}

export interface AssetClassAllocationItem {
  assetClass: string;
  currency: Currency;
  marketValue: MoneyJSON;
  allocationPercent: string;
  assetCount: number;
}

export interface CurrencyAllocationBucket {
  readonly currency: Currency;
  readonly totalMarketValue: MoneyJSON;
  readonly byAsset: readonly AssetAllocationItem[];
  readonly byAssetClass: readonly AssetClassAllocationItem[];
  readonly unvaluedAssets: readonly {
    readonly assetId: string;
    readonly ticker?: string;
    readonly assetType?: string;
    readonly currency: Currency;
    readonly reason: ValuationStatus;
  }[];
}

export interface PortfolioAllocation {
  readonly portfolioId: string;
  readonly asOf: string | null;
  readonly status: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
  readonly valuationCoveragePercent: string;
  readonly currencies: Readonly<Record<string, CurrencyAllocationBucket>>;
}

export function computePortfolioAllocation(valuation: PortfolioValuation): PortfolioAllocation {
  const currenciesRecord: Record<string, CurrencyAllocationBucket> = {};

  const totalPositions = valuation.summary.totalPositions;
  const valuedPositions = valuation.summary.valuedPositions;

  let portfolioStatus: 'COMPLETE' | 'PARTIAL' | 'EMPTY' = 'COMPLETE';
  if (totalPositions === 0) {
    portfolioStatus = 'EMPTY';
  } else if (valuedPositions < totalPositions) {
    portfolioStatus = 'PARTIAL';
  }

  // Group positions by currency
  const positionsByCurrency = new Map<Currency, PositionValuation[]>();
  for (const pos of valuation.positions) {
    const cur = pos.currency;
    const existing = positionsByCurrency.get(cur) ?? [];
    existing.push(pos);
    positionsByCurrency.set(cur, existing);
  }

  for (const [cur, posList] of positionsByCurrency.entries()) {
    const valuedList = posList.filter((p) => p.marketValue !== null);
    const unvaluedList = posList.filter((p) => p.marketValue === null);

    // Denominator: sum of marketValue for valued positions in this currency
    let totalMv = Money.zero(cur);
    for (const vp of valuedList) {
      if (vp.marketValue) {
        totalMv = totalMv.add(Money.from(vp.marketValue.amount, cur));
      }
    }

    const byAsset: AssetAllocationItem[] = [];
    for (const vp of valuedList) {
      let allocPct = '0';
      if (!totalMv.isZero() && vp.marketValue) {
        try {
          const itemQty = Quantity.from(vp.marketValue.amount);
          const totalQty = Quantity.from(totalMv.amount);
          const ratio = itemQty.divide(totalQty);
          const pct = ratio.multiply(Quantity.from('100'));
          allocPct = Percentage.from(pct.value).value;
        } catch {
          allocPct = '0';
        }
      }

      byAsset.push(
        Object.freeze({
          assetId: vp.assetId,
          ticker: vp.ticker,
          assetType: vp.assetType,
          currency: cur,
          marketValue: vp.marketValue!,
          allocationPercent: allocPct,
          quoteFreshness: vp.quoteFreshness,
        }),
      );
    }

    // Sort by assetId for determinism
    byAsset.sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)));

    // Group by assetClass
    const classMap = new Map<string, { total: Money; count: number }>();
    for (const vp of valuedList) {
      const cls = vp.assetType ?? 'OTHER';
      const existing = classMap.get(cls) ?? { total: Money.zero(cur), count: 0 };
      const itemMv = vp.marketValue ? Money.from(vp.marketValue.amount, cur) : Money.zero(cur);
      classMap.set(cls, {
        total: existing.total.add(itemMv),
        count: existing.count + 1,
      });
    }

    const byAssetClass: AssetClassAllocationItem[] = [];
    for (const [cls, data] of classMap.entries()) {
      let allocPct = '0';
      if (!totalMv.isZero()) {
        try {
          const itemQty = Quantity.from(data.total.amount);
          const totalQty = Quantity.from(totalMv.amount);
          const ratio = itemQty.divide(totalQty);
          const pct = ratio.multiply(Quantity.from('100'));
          allocPct = Percentage.from(pct.value).value;
        } catch {
          allocPct = '0';
        }
      }

      byAssetClass.push(
        Object.freeze({
          assetClass: cls,
          currency: cur,
          marketValue: { amount: data.total.amount, currency: cur },
          allocationPercent: allocPct,
          assetCount: data.count,
        }),
      );
    }

    // Sort by assetClass for determinism
    byAssetClass.sort((a, b) => a.assetClass.localeCompare(b.assetClass));

    const unvaluedAssets = unvaluedList.map((up) =>
      Object.freeze({
        assetId: up.assetId,
        ticker: up.ticker,
        assetType: up.assetType,
        currency: cur,
        reason: up.status,
      }),
    );
    unvaluedAssets.sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)));

    currenciesRecord[cur] = Object.freeze({
      currency: cur,
      totalMarketValue: { amount: totalMv.amount, currency: cur },
      byAsset: Object.freeze(byAsset),
      byAssetClass: Object.freeze(byAssetClass),
      unvaluedAssets: Object.freeze(unvaluedAssets),
    });
  }

  return Object.freeze({
    portfolioId: valuation.portfolioId,
    asOf: valuation.asOf,
    status: portfolioStatus,
    valuationCoveragePercent: valuation.summary.valuationCoveragePercent,
    currencies: Object.freeze(currenciesRecord),
  });
}
