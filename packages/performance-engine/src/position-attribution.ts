import { Quantity } from '@atlas/domain';

/**
 * Phase 5R-B — position attribution primitives (pure, zero I/O).
 *
 * Monthly Brinson-style attribution with exact decimals: each position's
 * contribution is weighted by start-of-month weights and chained with the
 * portfolio's own monthly returns. By construction, the sum of
 * contributions equals the chained portfolio return on the same grid —
 * the current weight is never used (prohibited approximation).
 */
export interface AttributionPositionInput {
  assetId: string;
  /** Start-of-month market values per month index (canonical decimal) or null when unvalued. */
  startValues: readonly (string | null)[];
  /** Monthly TWR per month index (Percentage value, e.g. "8.5") or null when unvalued. */
  monthlyReturns: readonly (string | null)[];
}

export interface AttributionMonthPoint {
  month: string;
  /** Target monthly TWR (Percentage value) or null when unvalued. */
  positionReturn: string | null;
  /** Target weight at month start (Percentage value, 0-100 scale) or null. */
  weightStart: string | null;
  /** Target contribution in percentage points of the portfolio return. */
  contributionPp: string | null;
  valued: boolean;
}

export interface PositionAttribution {
  months: readonly AttributionMonthPoint[];
  /** assetId -> chained contribution in percentage points. */
  contributions: Readonly<Record<string, string>>;
  /** Chained portfolio monthly return on the attribution grid (Percentage value). */
  portfolioReturnOnGrid: string;
  monthsValued: number;
  monthsTotal: number;
}

const HUNDRED = '100';

function toFraction(percentValue: string): Quantity {
  return Quantity.from(percentValue).divide(Quantity.from(HUNDRED));
}

function toPercent(fraction: Quantity): string {
  return fraction.multiply(Quantity.from(HUNDRED)).value;
}

/**
 * Attributes the portfolio return to positions month by month.
 *
 * The valued universe of each month is the set of positions with both a
 * start value and a monthly return; weights renormalize over it and
 * missing positions are excluded (never zero-filled). Contributions chain
 * with the portfolio's own monthly returns, so their sum equals the
 * chained portfolio return exactly up to decimal precision.
 */
export function attributePositionContributions(input: {
  months: readonly string[];
  positions: readonly AttributionPositionInput[];
  targetAssetId: string;
}): PositionAttribution {
  const monthCount = input.months.length;
  const points: AttributionMonthPoint[] = [];
  const chained = new Map<string, Quantity>();
  for (const position of input.positions) {
    chained.set(position.assetId, Quantity.zero());
  }
  let chainFactor = Quantity.from('1');
  let monthsValued = 0;

  for (let m = 0; m < monthCount; m += 1) {
    const valued = input.positions.filter(
      (position) =>
        position.startValues[m] !== null &&
        position.startValues[m] !== undefined &&
        position.monthlyReturns[m] !== null &&
        position.monthlyReturns[m] !== undefined,
    );
    let universeTotal = Quantity.zero();
    for (const position of valued) {
      universeTotal = universeTotal.add(Quantity.from(position.startValues[m] as string));
    }
    if (valued.length === 0 || universeTotal.isZero()) {
      points.push({
        month: input.months[m] as string,
        positionReturn: null,
        weightStart: null,
        contributionPp: null,
        valued: false,
      });
      continue;
    }
    monthsValued += 1;

    let monthReturnFraction = Quantity.zero();
    const weights = new Map<string, Quantity>();
    for (const position of valued) {
      const weight = Quantity.from(position.startValues[m] as string).divide(universeTotal);
      weights.set(position.assetId, weight);
      monthReturnFraction = monthReturnFraction.add(
        weight.multiply(toFraction(position.monthlyReturns[m] as string)),
      );
    }

    const previousChain = chainFactor;
    chainFactor = chainFactor.multiply(Quantity.from('1').add(monthReturnFraction));

    for (const position of valued) {
      const weight = weights.get(position.assetId) as Quantity;
      const contribution = weight
        .multiply(toFraction(position.monthlyReturns[m] as string))
        .multiply(previousChain);
      chained.set(position.assetId, (chained.get(position.assetId) as Quantity).add(contribution));
    }

    const target = valued.find((position) => position.assetId === input.targetAssetId);
    if (!target) {
      points.push({
        month: input.months[m] as string,
        positionReturn: null,
        weightStart: null,
        contributionPp: null,
        valued: false,
      });
      continue;
    }
    const targetWeight = weights.get(target.assetId) as Quantity;
    points.push({
      month: input.months[m] as string,
      positionReturn: target.monthlyReturns[m] as string,
      weightStart: toPercent(targetWeight),
      contributionPp: toPercent(
        targetWeight
          .multiply(toFraction(target.monthlyReturns[m] as string))
          .multiply(previousChain),
      ),
      valued: true,
    });
  }

  const contributions: Record<string, string> = {};
  for (const [assetId, total] of chained) {
    contributions[assetId] = toPercent(total);
  }
  return {
    months: points,
    contributions,
    portfolioReturnOnGrid: toPercent(chainFactor.subtract(Quantity.from('1'))),
    monthsValued,
    monthsTotal: monthCount,
  };
}

/**
 * Aggregates canonical per-disposal gains into a per-currency realized
 * total. Mirrors the ADR-045/ADR-046 rule used by the replay engine:
 * any INCOMPLETE disposal (or missing gain) poisons the bucket to null
 * instead of summing a partial total. Never averages returns.
 */
export function sumPositionRealized(
  disposals: readonly { gainLoss: string | null; status: 'KNOWN' | 'INCOMPLETE' }[],
): { total: string | null; status: 'KNOWN' | 'INCOMPLETE'; count: number } {
  let total = Quantity.zero();
  for (const disposal of disposals) {
    if (disposal.status !== 'KNOWN' || disposal.gainLoss === null) {
      return { total: null, status: 'INCOMPLETE', count: disposals.length };
    }
    total = total.add(Quantity.from(disposal.gainLoss));
  }
  if (disposals.length === 0) {
    return { total: '0', status: 'KNOWN', count: 0 };
  }
  return { total: total.value, status: 'KNOWN', count: disposals.length };
}
