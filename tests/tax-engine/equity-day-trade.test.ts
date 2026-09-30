import { describe, expect, it } from 'vitest';
import {
  assertEquityLegQuantityConservation,
  classifyEquityTradesForTax,
  type EquityExecution,
} from '@atlas/tax-engine';

const ASSET = 'asset-1';
const INST = 'broker-a';
const DAY = '2026-09-10';

function ex(
  transactionId: string,
  side: 'BUY' | 'SELL',
  quantity: string,
  sequence: number,
  opts: Partial<EquityExecution> = {},
): EquityExecution {
  return {
    transactionId,
    assetId: ASSET,
    institutionId: INST,
    tradeDate: DAY,
    side,
    quantity,
    unitPrice: '10',
    sequence,
    ...opts,
  };
}

function dayTradeQuantity(executions: EquityExecution[]): string {
  const r = classifyEquityTradesForTax(executions);
  return r.summaries.reduce((acc, s) => {
    const a = BigInt(acc.replace('.', ''));
    const b = BigInt(s.dayTradeQuantity.replace('.', ''));
    return (a + b).toString();
  }, '0');
}

describe('Phase 4G.2 — equity day-trade FIFO matching (frozen semantics)', () => {
  it('partial match A: inventory 100; buy 50; sell 120 → day trade 50 / normal 70', () => {
    const r = classifyEquityTradesForTax([ex('b', 'BUY', '50', 1), ex('s', 'SELL', '120', 2)]);
    assertEquityLegQuantityConservation([ex('b', 'BUY', '50', 1), ex('s', 'SELL', '120', 2)], r);
    const summary = r.summaries[0]!;
    expect(summary.dayTradeQuantity).toBe('50');
    expect(summary.normalSellQuantity).toBe('70');
    expect(summary.normalBuyQuantity).toBe('0');
    expect(summary.outcome).toBe('PARTIAL_NORMAL_AND_DAY_TRADE');
    // sell split into 50 day-trade + 70 normal
    const sellLegs = r.legs.filter((l) => l.sourceTransactionId === 's');
    expect(sellLegs.map((l) => l.classification).sort()).toEqual(['DAY_TRADE', 'NORMAL']);
    expect(sellLegs.map((l) => l.quantity).sort()).toEqual(['50', '70']);
  });

  it('partial match B: buy 100, sell 40, buy 50, sell 90 → day trade 130 / leftover buy 20', () => {
    const execs = [
      ex('b1', 'BUY', '100', 1),
      ex('s1', 'SELL', '40', 2),
      ex('b2', 'BUY', '50', 3),
      ex('s2', 'SELL', '90', 4),
    ];
    const r = classifyEquityTradesForTax(execs);
    assertEquityLegQuantityConservation(execs, r);
    const summary = r.summaries[0]!;
    expect(summary.dayTradeQuantity).toBe('130');
    expect(summary.normalBuyQuantity).toBe('20');
    expect(summary.normalSellQuantity).toBe('0');
  });

  it('sale-before-buy forms day trade', () => {
    const execs = [ex('s', 'SELL', '50', 1), ex('b', 'BUY', '50', 2)];
    const r = classifyEquityTradesForTax(execs);
    expect(r.summaries[0]!.dayTradeQuantity).toBe('50');
    expect(r.summaries[0]!.outcome).toBe('DAY_TRADE');
  });

  it('different brokers never match (both normal)', () => {
    const execs = [
      ex('a', 'BUY', '100', 1, { institutionId: 'broker-a' }),
      ex('b', 'SELL', '100', 1, { institutionId: 'broker-b' }),
    ];
    const r = classifyEquityTradesForTax(execs);
    expect(r.summaries.every((s) => s.dayTradeQuantity === '0')).toBe(true);
    expect(r.summaries.every((s) => s.outcome === 'NORMAL')).toBe(true);
  });

  it('different assets never match', () => {
    const execs = [
      ex('a', 'BUY', '100', 1, { assetId: 'x' }),
      ex('b', 'SELL', '100', 1, { assetId: 'y' }),
    ];
    const r = classifyEquityTradesForTax(execs);
    expect(r.summaries.every((s) => s.dayTradeQuantity === '0')).toBe(true);
  });

  it('different days never match', () => {
    const execs = [
      ex('a', 'BUY', '100', 1, { tradeDate: '2026-09-10' }),
      ex('b', 'SELL', '100', 1, { tradeDate: '2026-09-11' }),
    ];
    const r = classifyEquityTradesForTax(execs);
    expect(r.summaries.every((s) => s.dayTradeQuantity === '0')).toBe(true);
  });

  it('fails closed on missing ordering/identity/quantity', () => {
    expect(() => classifyEquityTradesForTax([ex('a', 'BUY', '10', 1, { sequence: NaN })])).toThrow(
      /MISSING_SEQUENCE/,
    );
    expect(() => classifyEquityTradesForTax([ex('a', 'BUY', '0', 1)])).toThrow(/INVALID_QUANTITY/);
    expect(() =>
      classifyEquityTradesForTax([ex('a', 'BUY', '10', 1, { institutionId: '' })]),
    ).toThrow(/MISSING_IDENTITY/);
    expect(() =>
      classifyEquityTradesForTax([ex('a', 'BUY', '10', 1, { tradeDate: '2026-13-01' })]),
    ).toThrow(/INVALID_TRADE_DATE/);
  });
});

// Deterministic seeded RNG (mulberry32) — tests only.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Phase 4G.2 — day-trade matching property/fuzz (seed 20260930)', () => {
  it('conserves quantity, is deterministic, and never exceeds min(buys,sells)', () => {
    const rand = rng(20260930);
    for (let caseIdx = 0; caseIdx < 10000; caseIdx += 1) {
      const n = 1 + Math.floor(rand() * 8);
      const execs: EquityExecution[] = [];
      for (let i = 0; i < n; i += 1) {
        const side = rand() < 0.5 ? 'BUY' : 'SELL';
        const qty = String(1 + Math.floor(rand() * 100));
        execs.push(ex(`t${caseIdx}-${i}`, side, qty, i + 1));
      }
      const result = classifyEquityTradesForTax(execs);
      assertEquityLegQuantityConservation(execs, result);
      for (const leg of result.legs) {
        expect(Number(leg.quantity)).toBeGreaterThan(0);
      }
      const summary = result.summaries[0]!;
      const totalBuy = execs
        .filter((e) => e.side === 'BUY')
        .reduce((a, e) => a + Number(e.quantity), 0);
      const totalSell = execs
        .filter((e) => e.side === 'SELL')
        .reduce((a, e) => a + Number(e.quantity), 0);
      expect(Number(summary.dayTradeQuantity)).toBeLessThanOrEqual(Math.min(totalBuy, totalSell));
      // Determinism under input permutation.
      const shuffled = [...execs].reverse();
      const result2 = classifyEquityTradesForTax(shuffled);
      expect(result2.summaries[0]!.dayTradeQuantity).toBe(summary.dayTradeQuantity);
      expect(dayTradeQuantity(shuffled)).toBe(dayTradeQuantity(execs));
    }
  }, 60_000);
});
