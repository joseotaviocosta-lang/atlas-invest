import { describe, it, expect } from 'vitest';
import { LocalDate, Transaction } from '@atlas/domain';
import { replayPortfolio, replayPortfolioTimeline, PortfolioState } from '@atlas/portfolio-engine';
import { PortfolioScenarioBuilder } from './scenario-builder';
import {
  PORTFOLIO_DEFAULT,
  ACCOUNT_XP,
  ACCOUNT_NU,
  ASSET_PETR4,
  ASSET_VALE3,
} from './fixtures/assets';

/**
 * Full-state normalizer: converts Maps to deterministically-sorted arrays and
 * relies on the domain value objects' toJSON (Money/Quantity/Percentage/
 * LocalDate). Compares EVERY public field of PortfolioState, including
 * transfer audit metadata (status, counterparty, carriedCost), summaries,
 * events and counts. Map ordering is technical-only and normalized.
 */
function fingerprint(state: PortfolioState): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Map) {
      return [...value.entries()]
        .sort(([a], [b]) => (String(a) < String(b) ? -1 : 1))
        .map(([k, v]) => [String(k), v]);
    }
    return value;
  });
}

function assertExactTimeline(
  transactions: Transaction[],
  dates: string[],
  portfolioId = PORTFOLIO_DEFAULT,
) {
  const timeline = replayPortfolioTimeline({ portfolioId, transactions, asOfDates: dates });
  expect(timeline.snapshots.map((s) => s.asOfDate.toString())).toEqual(dates);
  for (const snapshot of timeline.snapshots) {
    const single = replayPortfolio({
      portfolioId,
      transactions,
      asOfDate: snapshot.asOfDate,
    });
    expect(fingerprint(snapshot.state), `asOf ${snapshot.asOfDate}`).toBe(
      fingerprint(single.state),
    );
    expect(snapshot.state.asOfDate?.toString()).toBe(snapshot.asOfDate.toString());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.state)).toBe(true);
  }
  return timeline;
}

describe('Timeline equivalence (additive multi-date replay)', () => {
  it('BUY/SELL/DEPOSIT/WITHDRAWAL timeline is exactly equivalent', () => {
    const transactions = new PortfolioScenarioBuilder()
      .deposit({ amount: '10000', tradeDate: '2026-01-05' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30', tradeDate: '2026-01-06' })
      .buy({ assetId: ASSET_VALE3, quantity: '50', unitPrice: '60', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '35', tradeDate: '2026-01-20' })
      .withdrawal({ amount: '1000', tradeDate: '2026-02-02' })
      .build();
    assertExactTimeline(transactions, ['2026-01-07', '2026-01-15', '2026-01-25', '2026-02-10']);
  });

  it('SPLIT/BONUS/AMORTIZATION/SUBSCRIPTION timeline is exactly equivalent', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30', tradeDate: '2026-01-06' })
      .split({ assetId: ASSET_PETR4, factor: '2', tradeDate: '2026-01-15' })
      .bonus({ assetId: ASSET_PETR4, quantity: '10', assignedCost: '100', tradeDate: '2026-01-20' })
      .amortization({ assetId: ASSET_PETR4, amount: '50', tradeDate: '2026-02-01' })
      .subscription({
        assetId: ASSET_PETR4,
        quantity: '20',
        unitPrice: '15',
        tradeDate: '2026-02-10',
      })
      .build();
    assertExactTimeline(transactions, ['2026-01-07', '2026-01-18', '2026-02-05', '2026-02-15']);
  });

  it('REVERSE_SPLIT/DIVIDEND/JCP/FII_INCOME/FEE/TAX timeline is exactly equivalent', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '200', unitPrice: '30', tradeDate: '2026-01-06' })
      .reverseSplit({ assetId: ASSET_PETR4, factor: '2', tradeDate: '2026-01-12' })
      .dividend({ assetId: ASSET_PETR4, amount: '150', tradeDate: '2026-01-18' })
      .jcp({ assetId: ASSET_PETR4, amount: '80', tradeDate: '2026-01-22' })
      .fiiIncome({ assetId: ASSET_PETR4, amount: '60', tradeDate: '2026-01-26' })
      .fee({ amount: '25', tradeDate: '2026-02-01' })
      .tax({ amount: '15', tradeDate: '2026-02-05' })
      .build();
    assertExactTimeline(transactions, ['2026-01-10', '2026-01-20', '2026-02-03', '2026-02-10']);
  });

  it('matched transfer across dates: state is exactly equivalent', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30',
        tradeDate: '2026-01-06',
        accountId: ACCOUNT_XP,
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        transferGroupId: 'grp-timeline-1',
        outTradeDate: '2026-01-15',
        inTradeDate: '2026-01-20',
      })
      .buy({
        assetId: ASSET_PETR4,
        quantity: '10',
        unitPrice: '35',
        tradeDate: '2026-01-22',
        accountId: ACCOUNT_NU,
      })
      .build();
    // Intermediate date sits strictly between the out-leg and in-leg.
    assertExactTimeline(transactions, ['2026-01-10', '2026-01-17', '2026-01-21', '2026-01-25']);
  });

  it('unmatched transfer legs: state is exactly equivalent', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30',
        tradeDate: '2026-01-06',
        accountId: ACCOUNT_XP,
      })
      .transferOut({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '30',
        transferGroupId: 'grp-unmatched-out',
        tradeDate: '2026-01-15',
      })
      .build();
    assertExactTimeline(transactions, ['2026-01-10', '2026-01-20']);
  });

  it('destination weighted cost and cost completeness (KNOWN/INCOMPLETE) preserved', () => {
    const transactions = new PortfolioScenarioBuilder()
      .transferIn({
        accountId: ACCOUNT_NU,
        assetId: ASSET_VALE3,
        quantity: '50',
        transferGroupId: 'grp-incomplete',
        tradeDate: '2026-01-12',
      })
      .buy({
        assetId: ASSET_VALE3,
        quantity: '50',
        unitPrice: '60',
        tradeDate: '2026-01-18',
        accountId: ACCOUNT_NU,
      })
      .build();
    const timeline = assertExactTimeline(transactions, ['2026-01-15', '2026-01-20']);
    const state = timeline.snapshots[1]!.state;
    const asset = state.assets.get(String(ASSET_VALE3));
    expect(asset?.costBasisStatus).toBe('INCOMPLETE');
    expect(asset?.totalCost).toBeUndefined();
  });

  it('known zero cost is preserved (distinct from INCOMPLETE)', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30', tradeDate: '2026-01-06' })
      .amortization({ assetId: ASSET_PETR4, amount: '3000', tradeDate: '2026-01-20' })
      .build();
    const timeline = assertExactTimeline(transactions, ['2026-01-10', '2026-01-25']);
    const asset = timeline.snapshots[1]!.state.assets.get(String(ASSET_PETR4));
    expect(asset?.costBasisStatus).toBe('KNOWN');
    expect(asset?.totalCost?.amount).toBe('0');
  });

  it('ordering is canonical and asOf is inclusive with no future leakage', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30', tradeDate: '2026-01-15' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '32', tradeDate: '2026-01-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '30', unitPrice: '35', tradeDate: '2026-01-16' })
      .build();
    const timeline = assertExactTimeline(transactions, ['2026-01-15', '2026-01-16']);
    const day15 = timeline.snapshots[0]!.state.assets.get(String(ASSET_PETR4));
    expect(day15?.quantity.value).toBe('150');
    const day16 = timeline.snapshots[1]!.state.assets.get(String(ASSET_PETR4));
    expect(day16?.quantity.value).toBe('120');

    // A pre-inception asOf contains none of the transactions.
    const empty = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
      asOfDates: ['2026-01-01'],
    });
    expect(empty.snapshots[0]!.state.assets.size).toBe(0);
    expect(empty.snapshots[0]!.state.processedTransactionCount).toBe(0);
  });

  it('cross-date future-knowledge fixture: out 01-10 / in 01-15, full audit equivalence', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30',
        tradeDate: '2026-01-05',
        accountId: ACCOUNT_XP,
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        transferGroupId: 'grp-future-knowledge',
        outTradeDate: '2026-01-10',
        inTradeDate: '2026-01-15',
      })
      .build();
    const timeline = assertExactTimeline(transactions, [
      '2026-01-09',
      '2026-01-10',
      '2026-01-12',
      '2026-01-15',
      '2026-01-16',
    ]);
    // D=01-12: out-leg recorded UNMATCHED_OUT (in-leg in the future) — exactly as replay.
    const day12 = timeline.snapshots[2]!.state;
    expect(day12.appliedTransfers.map((t) => t.status)).toEqual(['UNMATCHED_OUT']);
    // D=01-15: both legs MATCHED — exactly as replay.
    const day15 = timeline.snapshots[3]!.state;
    expect(day15.appliedTransfers.map((t) => t.status).sort()).toEqual(['MATCHED', 'MATCHED']);
    // No future knowledge: the in-leg (day 15) never appears in the day-12 snapshot.
    expect(day12.appliedTransfers.some((t) => String(t.tradeDate) === '2026-01-15')).toBe(false);
  });

  it('same-date matched pair with inverted createdAt order is fully equivalent', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30',
        tradeDate: '2026-01-05',
        accountId: ACCOUNT_XP,
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '25',
        transferGroupId: 'grp-same-date',
        outTradeDate: '2026-01-12',
        inTradeDate: '2026-01-12',
        outCreatedAt: new Date('2026-01-12T10:00:00Z'),
        inCreatedAt: new Date('2026-01-12T09:00:00Z'),
      })
      .build();
    assertExactTimeline(transactions, ['2026-01-10', '2026-01-12', '2026-01-15']);
  });

  it('multiple pairs (completed / pending / completed-later) know only canonical history', () => {
    const builder = new PortfolioScenarioBuilder().buy({
      assetId: ASSET_PETR4,
      quantity: '300',
      unitPrice: '30',
      tradeDate: '2026-01-02',
      accountId: ACCOUNT_XP,
    });
    builder.transfer({
      fromAccountId: ACCOUNT_XP,
      toAccountId: ACCOUNT_NU,
      assetId: ASSET_PETR4,
      quantity: '50',
      transferGroupId: 'grp-A',
      outTradeDate: '2026-01-05',
      inTradeDate: '2026-01-08',
    });
    builder.transfer({
      fromAccountId: ACCOUNT_XP,
      toAccountId: ACCOUNT_NU,
      assetId: ASSET_PETR4,
      quantity: '60',
      transferGroupId: 'grp-B',
      outTradeDate: '2026-01-12',
      inTradeDate: '2026-01-20',
    });
    builder.transfer({
      fromAccountId: ACCOUNT_XP,
      toAccountId: ACCOUNT_NU,
      assetId: ASSET_PETR4,
      quantity: '70',
      transferGroupId: 'grp-C',
      outTradeDate: '2026-01-18',
      inTradeDate: '2026-01-25',
    });
    const transactions = builder.build();
    assertExactTimeline(transactions, [
      '2026-01-06',
      '2026-01-10',
      '2026-01-15',
      '2026-01-22',
      '2026-01-26',
    ]);
  });

  it('deterministic property sweep: shuffled input, many dates, mixed ledger', () => {
    const builder = new PortfolioScenarioBuilder()
      .deposit({ amount: '50000', tradeDate: '2026-01-02' })
      .buy({ assetId: ASSET_PETR4, quantity: '120', unitPrice: '28', tradeDate: '2026-01-03' })
      .buy({ assetId: ASSET_VALE3, quantity: '80', unitPrice: '55', tradeDate: '2026-01-04' })
      .sell({ assetId: ASSET_PETR4, quantity: '20', unitPrice: '32', tradeDate: '2026-01-09' })
      .split({ assetId: ASSET_VALE3, factor: '2', tradeDate: '2026-01-11' })
      .dividend({ assetId: ASSET_PETR4, amount: '200', tradeDate: '2026-01-14' })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '30',
        transferGroupId: 'grp-prop',
        outTradeDate: '2026-01-16',
        inTradeDate: '2026-01-19',
      })
      .fee({ amount: '40', tradeDate: '2026-01-21' });
    const ordered = builder.build();
    const reversed = [...ordered].reverse();
    const dates = ['2026-01-05', '2026-01-10', '2026-01-15', '2026-01-20', '2026-01-25'];
    const fromOrdered = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: ordered,
      asOfDates: dates,
    });
    const fromReversed = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: reversed,
      asOfDates: dates,
    });
    expect(fromOrdered.snapshots.map((s) => fingerprint(s.state))).toEqual(
      fromReversed.snapshots.map((s) => fingerprint(s.state)),
    );
    assertExactTimeline(ordered, dates);
  });

  it('no-future-leakage: a drastic future transaction leaves earlier snapshots identical', () => {
    const builder = new PortfolioScenarioBuilder().buy({
      assetId: ASSET_PETR4,
      quantity: '100',
      unitPrice: '30',
      tradeDate: '2026-01-06',
      accountId: ACCOUNT_XP,
    });
    builder.buy({
      assetId: ASSET_PETR4,
      quantity: '1000000',
      unitPrice: '999',
      tradeDate: '2026-06-01',
      accountId: ACCOUNT_XP,
    });
    const transactions = builder.build();
    const timeline = assertExactTimeline(transactions, ['2026-01-10', '2026-02-01']);
    expect(timeline.snapshots[0]!.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe(
      '100',
    );
  });

  it('snapshots are immutable across later processing (D1/D2 unchanged by D3)', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30', tradeDate: '2026-01-06' })
      .sell({ assetId: ASSET_PETR4, quantity: '90', unitPrice: '35', tradeDate: '2026-02-01' })
      .build();
    const shortRun = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
      asOfDates: ['2026-01-10', '2026-01-20'],
    });
    const longRun = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
      asOfDates: ['2026-01-10', '2026-01-20', '2026-02-10'],
    });
    expect(fingerprint(longRun.snapshots[0]!.state)).toBe(
      fingerprint(shortRun.snapshots[0]!.state),
    );
    expect(fingerprint(longRun.snapshots[1]!.state)).toBe(
      fingerprint(shortRun.snapshots[1]!.state),
    );
    // The earlier snapshots were already frozen before D3 was processed.
    expect(Object.isFrozen(shortRun.snapshots[0]!.state.assets)).toBe(true);
  });

  it('empty and duplicate asOfDates are handled deterministically', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '10', unitPrice: '30', tradeDate: '2026-01-06' })
      .build();
    const timeline = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
      asOfDates: ['2026-01-10', '2026-01-10', '2026-01-05'],
    });
    expect(timeline.snapshots.map((s) => s.asOfDate.toString())).toEqual([
      '2026-01-05',
      '2026-01-10',
    ]);
    const empty = replayPortfolioTimeline({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
      asOfDates: [],
    });
    expect(empty.snapshots).toHaveLength(0);
  });

  it('input ledger and requested dates are never mutated', () => {
    const transactions = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '10', unitPrice: '30', tradeDate: '2026-01-06' })
      .build();
    const beforeIds = transactions.map((t) => String(t.id));
    const dates = [LocalDate.from('2026-01-10'), LocalDate.from('2026-01-05')];
    replayPortfolioTimeline({ portfolioId: PORTFOLIO_DEFAULT, transactions, asOfDates: dates });
    expect(transactions.map((t) => String(t.id))).toEqual(beforeIds);
    expect(dates.map((d) => d.toString())).toEqual(['2026-01-10', '2026-01-05']);
  });
});
