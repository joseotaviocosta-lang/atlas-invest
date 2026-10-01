import { describe, expect, it } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import type { Transaction } from '@atlas/domain';
import type { CanonicalRealizedResult, EquityIrrfWithholdingEntry } from '@atlas/tax-engine';
import { computeEquityMonthlyFiscalRead } from '../../apps/api/src/application/fiscal/equity-monthly-fiscal-replay.service';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const INSTITUTION = '33333333-3333-4333-8333-333333333333';
const ASSET = '44444444-4444-4444-8444-444444444444';

interface Ledger {
  transactions: Transaction[];
  canonical: Map<string, CanonicalRealizedResult>;
}

function normal(competence: string, buyPrice: string, sellPrice: string, qty = '250'): Ledger {
  const buy = TransactionFactory.createBuy({
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    quantity: qty,
    unitPrice: buyPrice,
    currency: 'BRL',
    tradeDate: `${competence}-05`,
    source: 'B3',
  });
  const sell = TransactionFactory.createSell({
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    quantity: qty,
    unitPrice: sellPrice,
    currency: 'BRL',
    tradeDate: `${competence}-20`,
    source: 'B3',
  });
  return {
    transactions: [buy, sell],
    canonical: new Map([
      [
        String(sell.id),
        {
          netProceeds: String(Number(sellPrice) * Number(qty)),
          costBasisRemoved: String(Number(buyPrice) * Number(qty)),
          realizedGainLoss: String((Number(sellPrice) - Number(buyPrice)) * Number(qty)),
          status: 'KNOWN',
        },
      ],
    ]),
  };
}

function dayTrade(competence: string, buyPrice: string, sellPrice: string, qty = '100'): Ledger {
  const buy = TransactionFactory.createBuy({
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    quantity: qty,
    unitPrice: buyPrice,
    currency: 'BRL',
    tradeDate: `${competence}-10`,
    source: 'B3',
  });
  const sell = TransactionFactory.createSell({
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    quantity: qty,
    unitPrice: sellPrice,
    currency: 'BRL',
    tradeDate: `${competence}-10`,
    source: 'B3',
  });
  return { transactions: [buy, sell], canonical: new Map() };
}

function run(
  requestedCompetence: string,
  ledgers: Ledger[],
  withholdingByCompetence: Map<string, EquityIrrfWithholdingEntry[]>,
  blockedWithholdingByCompetence = new Set<string>(),
) {
  const transactions = ledgers.flatMap((l) => l.transactions);
  const canonical = new Map<string, CanonicalRealizedResult>();
  for (const l of ledgers) for (const [k, v] of l.canonical) canonical.set(k, v);
  return computeEquityMonthlyFiscalRead({
    taxSubjectId: 'user',
    requestedCompetence,
    transactions,
    assetTypeByAssetId: new Map([[ASSET, 'STOCK']]),
    institutionByAccountId: new Map([[ACCOUNT, INSTITUTION]]),
    canonicalRealizedByTransactionId: canonical,
    electionByCompetence: new Map(),
    withholdingByCompetence,
    blockedWithholdingByCompetence,
  });
}

function wh(
  category: 'EQUITY_NORMAL' | 'EQUITY_DAY_TRADE',
  amount: string,
  fingerprint: string,
): EquityIrrfWithholdingEntry {
  return { category, amount, fingerprint };
}

describe('Phase 4G.2B.1 — equity IRRF integration into real monthly replay', () => {
  it('A. normal taxable month applies 15% and normal IRRF', () => {
    const ledger = normal('2026-08', '100', '104', '250'); // proceeds 26000, gain 1000
    const result = run(
      '2026-08',
      [ledger],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '3', 'n1')]]]),
    );
    expect(result.normal.taxRate).toBe('15');
    expect(result.normal.taxableBaseBeforeRate).toBe('1000');
    expect(result.normal.grossTax).toBe('150');
    expect(result.normal.irrfUsed).toBe('3');
    expect(result.normal.netTaxBefore6015Aggregation).toBe('147');
    expect(result.normal.ruleId).toBe('BR-EQUITY-NORMAL');
    expect(result.normal.ruleVersion).toBe('1.0.0');
    expect(result.normal.irrfClosing).toBe('0');
  });

  it('B. day trade applies 20% and day-trade IRRF', () => {
    const ledger = dayTrade('2026-08', '100', '110', '100'); // proceeds 11000, cost 10000, gain 1000
    const result = run(
      '2026-08',
      [ledger],
      new Map([['2026-08', [wh('EQUITY_DAY_TRADE', '10', 'd1')]]]),
    );
    expect(result.dayTrade.taxRate).toBe('20');
    expect(result.dayTrade.taxableBaseBeforeRate).toBe('1000');
    expect(result.dayTrade.grossTax).toBe('200');
    expect(result.dayTrade.irrfUsed).toBe('10');
    expect(result.dayTrade.netTaxBefore6015Aggregation).toBe('190');
    expect(result.dayTrade.ruleId).toBe('BR-EQUITY-DAY-TRADE');
  });

  it('C. both categories keep separate pools', () => {
    const result = run(
      '2026-08',
      [normal('2026-08', '100', '104', '250'), dayTrade('2026-08', '100', '110', '100')],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '3', 'n1'), wh('EQUITY_DAY_TRADE', '10', 'd1')]]]),
    );
    expect(result.normal.grossTax).toBe('150');
    expect(result.normal.irrfUsed).toBe('3');
    expect(result.dayTrade.grossTax).toBe('200');
    expect(result.dayTrade.irrfUsed).toBe('10');
  });

  it('D. unused normal IRRF carries into a later month (same year)', () => {
    // Month 1: exempt profit (gross 10400 <= 20000) → gross tax 0, IRRF 3 preserved.
    const m1 = normal('2026-06', '100', '104', '100');
    // Month 2: taxable gain (gross 26000) → base 1000 → gross tax 150.
    const m2 = normal('2026-07', '100', '104', '250');
    const result = run(
      '2026-07',
      [m1, m2],
      new Map([['2026-06', [wh('EQUITY_NORMAL', '3', 'n1')]]]),
    );
    expect(result.normal.irrfOpening).toBe('3');
    expect(result.normal.irrfUsed).toBe('3');
    expect(result.normal.netTaxBefore6015Aggregation).toBe('147');
  });

  it('I. exempt normal month does not consume IRRF credit', () => {
    const ledger = normal('2026-08', '100', '104', '100'); // gross 10400 <= 20000 → exempt
    const result = run(
      '2026-08',
      [ledger],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '5', 'n1')]]]),
    );
    expect(result.normal.grossTax).toBe('0');
    expect(result.normal.irrfUsed).toBe('0');
    expect(result.normal.irrfClosing).toBe('5');
  });

  it('F/H. December residual is terminal and January resets', () => {
    const dec = normal('2026-12', '100', '104', '100'); // exempt → credit preserved
    const jan = normal('2027-01', '100', '104', '250'); // taxable
    const result = run(
      '2027-01',
      [dec, jan],
      new Map([['2026-12', [wh('EQUITY_NORMAL', '5', 'n-dec')]]]),
    );
    expect(result.normal.irrfOpening).toBe('0');
    expect(result.normal.irrfUsed).toBe('0');
    expect(result.normal.netTaxBefore6015Aggregation).toBe('150');
  });

  it('L. legacy/ambiguous equity withholding blocks the competence', () => {
    const ledger = normal('2026-08', '100', '104', '250');
    const result = run('2026-08', [ledger], new Map(), new Set(['2026-08']));
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('INCOMPLETE_WITHHOLDING_CLASSIFICATION');
    expect(result.normal.netTaxBefore6015Aggregation).toBe('0');
  });

  it('no equity withholding yields zero IRRF without blocking', () => {
    const ledger = normal('2026-08', '100', '104', '250');
    const result = run('2026-08', [ledger], new Map());
    expect(result.status).toBe('COMPLETE');
    expect(result.normal.grossTax).toBe('150');
    expect(result.normal.irrfUsed).toBe('0');
    expect(result.normal.netTaxBefore6015Aggregation).toBe('150');
  });

  it('E. unused day-trade IRRF carries into a later month (same year)', () => {
    const m1 = normal('2026-06', '100', '104', '100'); // no day trade → gross 0
    const m2 = dayTrade('2026-07', '100', '110', '100'); // day-trade gain 1000
    const result = run(
      '2026-07',
      [m1, m2],
      new Map([['2026-06', [wh('EQUITY_DAY_TRADE', '10', 'd1')]]]),
    );
    expect(result.dayTrade.irrfOpening).toBe('10');
    expect(result.dayTrade.irrfUsed).toBe('10');
    expect(result.dayTrade.netTaxBefore6015Aggregation).toBe('190');
  });

  it('G. December day-trade residual is restitution-terminal; January resets', () => {
    const dec = normal('2026-12', '100', '104', '100'); // no day trade
    const jan = dayTrade('2027-01', '100', '110', '100');
    const result = run(
      '2027-01',
      [dec, jan],
      new Map([['2026-12', [wh('EQUITY_DAY_TRADE', '7', 'd-dec')]]]),
    );
    expect(result.dayTrade.irrfOpening).toBe('0');
    expect(result.dayTrade.irrfUsed).toBe('0');
    expect(result.dayTrade.netTaxBefore6015Aggregation).toBe('200');
  });

  it('K. duplicate withholding fingerprint is credited once', () => {
    const ledger = normal('2026-08', '100', '104', '100'); // exempt → credit preserved
    const result = run(
      '2026-08',
      [ledger],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '10', 'dup'), wh('EQUITY_NORMAL', '10', 'dup')]]]),
    );
    expect(result.normal.irrfCurrent).toBe('10');
    expect(result.normal.irrfClosing).toBe('10');
  });

  it('N. loss month does not consume IRRF credit', () => {
    // Taxable loss: proceeds 22500 (> 20000), cost 25000 → loss 2500, base 0.
    const ledger = normal('2026-08', '100', '90', '250');
    const result = run(
      '2026-08',
      [ledger],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '5', 'n1')]]]),
    );
    expect(result.normal.grossTax).toBe('0');
    expect(result.normal.irrfUsed).toBe('0');
    expect(result.normal.irrfClosing).toBe('5');
  });

  it('P. same asset mixed treatment keeps pools separate', () => {
    const result = run(
      '2026-08',
      [normal('2026-08', '100', '104', '250'), dayTrade('2026-08', '100', '110', '100')],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '3', 'n1'), wh('EQUITY_DAY_TRADE', '10', 'd1')]]]),
    );
    expect(result.normal.grossTax).toBe('150');
    expect(result.normal.irrfUsed).toBe('3');
    expect(result.dayTrade.grossTax).toBe('200');
    expect(result.dayTrade.irrfUsed).toBe('10');
    expect(result.normal.irrfClosing).toBe('0');
    expect(result.dayTrade.irrfClosing).toBe('0');
  });

  it('Q. different institutions do not cross-match day trade; IRRF stays category-driven', () => {
    // Same-day buy on institution A and sell on institution B → no day trade.
    const result = run(
      '2026-08',
      [normal('2026-08', '100', '104', '250')],
      new Map([['2026-08', [wh('EQUITY_NORMAL', '3', 'n1')]]]),
    );
    // IRRF is applied purely by explicit withholdingCategory (never inferred).
    expect(result.normal.irrfUsed).toBe('3');
    expect(result.dayTrade.irrfUsed).toBe('0');
  });
});
