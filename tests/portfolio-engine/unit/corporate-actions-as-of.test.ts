import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { createPortfolioReplayEngine } from '@atlas/portfolio-engine';
import { ASSET_PETR4, ACCOUNT_XP, ACCOUNT_NU, PORTFOLIO_DEFAULT } from '../fixtures/assets';
import { Money, Quantity } from '@atlas/domain';

describe('Portfolio Engine Core: Corporate Actions As-Of Filtering, Multi-Account Isolation & Determinism', () => {
  it('should evaluate corporate actions strictly according to asOf timeline', () => {
    // Jan 10: Buy 100 @ R$ 10.00 (cost 1000, avg 10)
    // Feb 10: Split 2:1 (qty 200, cost 1000, avg 5)
    // Mar 10: Amortization R$ 200.00 (qty 200, cost 800, avg 4)
    // Apr 10: Sell 50 @ R$ 8.00 (qty 150, cost 600, avg 4, realized gain R$ 200.00)
    const baseScenario = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .split({ factor: '2', tradeDate: '2026-02-10' })
      .amortization({ amount: '200.00', tradeDate: '2026-03-10' })
      .sell({ quantity: '50', unitPrice: '8.00', tradeDate: '2026-04-10' });

    // As of Jan 31: before split
    const resJan = baseScenario.asOf('2026-01-31').replay();
    const posJan = resJan.state.assets.get(String(ASSET_PETR4))!;
    expect(posJan.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(posJan.totalCost?.equals(Money.from('1000.00', 'BRL'))).toBe(true);
    expect(posJan.averageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(resJan.state.appliedCorporateActions).toHaveLength(0);
    expect(resJan.state.realizedDisposals).toHaveLength(0);

    // As of Feb 28: after split, before amortization
    const resFeb = baseScenario.asOf('2026-02-28').replay();
    const posFeb = resFeb.state.assets.get(String(ASSET_PETR4))!;
    expect(posFeb.quantity.equals(Quantity.from('200'))).toBe(true);
    expect(posFeb.totalCost?.equals(Money.from('1000.00', 'BRL'))).toBe(true);
    expect(posFeb.averageCost?.equals(Money.from('5.00', 'BRL'))).toBe(true);
    expect(resFeb.state.appliedCorporateActions).toHaveLength(1);
    expect(resFeb.state.appliedCorporateActions[0].type).toBe('SPLIT');
    expect(resFeb.state.realizedDisposals).toHaveLength(0);

    // As of Mar 31: after amortization, before sell
    const resMar = baseScenario.asOf('2026-03-31').replay();
    const posMar = resMar.state.assets.get(String(ASSET_PETR4))!;
    expect(posMar.quantity.equals(Quantity.from('200'))).toBe(true);
    expect(posMar.totalCost?.equals(Money.from('800.00', 'BRL'))).toBe(true);
    expect(posMar.averageCost?.equals(Money.from('4.00', 'BRL'))).toBe(true);
    expect(resMar.state.appliedCorporateActions).toHaveLength(2);
    expect(resMar.state.realizedDisposals).toHaveLength(0);

    // As of Apr 30: after sell
    const resApr = baseScenario.asOf('2026-04-30').replay();
    const posApr = resApr.state.assets.get(String(ASSET_PETR4))!;
    expect(posApr.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(posApr.totalCost?.equals(Money.from('600.00', 'BRL'))).toBe(true);
    expect(posApr.averageCost?.equals(Money.from('4.00', 'BRL'))).toBe(true);
    expect(resApr.state.appliedCorporateActions).toHaveLength(2);
    expect(resApr.state.realizedDisposals).toHaveLength(1);
    expect(
      resApr.state.realizedDisposals[0].costBasisRemoved?.equals(Money.from('200.00', 'BRL')),
    ).toBe(true); // 50 * 4 = 200
    expect(
      resApr.state.realizedDisposals[0].realizedGainLoss?.equals(Money.from('200.00', 'BRL')),
    ).toBe(true); // 400 - 200 = 200
  });

  it('should ensure multi-account isolation: corporate action in account XP does not affect account NU', () => {
    // Account XP: Buy 100 @ 10, then Split 2:1 -> XP has 200 @ avg 5
    // Account NU: Buy 50 @ 10 -> NU has 50 @ avg 10 (unaffected!)
    const result = scenario()
      .buy({ accountId: ACCOUNT_XP, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .buy({ accountId: ACCOUNT_NU, quantity: '50', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .split({ accountId: ACCOUNT_XP, factor: '2', tradeDate: '2026-01-20' })
      .replay();

    const xpAccount = result.state.accounts.get(String(ACCOUNT_XP))!;
    const nuAccount = result.state.accounts.get(String(ACCOUNT_NU))!;

    const xpPetr4 = xpAccount.assets.get(String(ASSET_PETR4))!;
    expect(xpPetr4.quantity.equals(Quantity.from('200'))).toBe(true);
    expect(xpPetr4.averageCost?.equals(Money.from('5.00', 'BRL'))).toBe(true);
    expect(xpAccount.appliedCorporateActions).toHaveLength(1);

    const nuPetr4 = nuAccount.assets.get(String(ASSET_PETR4))!;
    expect(nuPetr4.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(nuPetr4.averageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(nuAccount.appliedCorporateActions).toHaveLength(0);

    // Consolidated portfolio: 200 + 50 = 250 shares, totalCost = 1000 + 500 = 1500, averageCost = 1500 / 250 = 6.00
    const consolidated = result.state.assets.get(String(ASSET_PETR4))!;
    expect(consolidated.quantity.equals(Quantity.from('250'))).toBe(true);
    expect(consolidated.totalCost?.equals(Money.from('1500.00', 'BRL'))).toBe(true);
    expect(consolidated.averageCost?.equals(Money.from('6.00', 'BRL'))).toBe(true);
    expect(result.state.appliedCorporateActions).toHaveLength(1);
  });

  it('should ensure deterministic replay across 50 random shufflings of transaction input order', () => {
    const builder = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .split({ factor: '2', tradeDate: '2026-01-15' })
      .bonus({ quantity: '20', assignedCost: '100.00', tradeDate: '2026-01-20' })
      .amortization({ amount: '200.00', tradeDate: '2026-01-25' })
      .sell({ quantity: '50', unitPrice: '8.00', tradeDate: '2026-01-30' });

    const canonicalTxList = builder.build();
    const engine = createPortfolioReplayEngine();
    const baseline = engine.replay({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: canonicalTxList,
    });

    for (let i = 0; i < 50; i++) {
      // Shuffle transactions
      const shuffled = [...canonicalTxList].sort(() => Math.random() - 0.5);
      const permutedResult = engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: shuffled,
      });

      expect(permutedResult.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe(
        baseline.state.assets.get(String(ASSET_PETR4))?.quantity.value,
      );
      expect(permutedResult.state.assets.get(String(ASSET_PETR4))?.totalCost?.amount).toBe(
        baseline.state.assets.get(String(ASSET_PETR4))?.totalCost?.amount,
      );
      expect(permutedResult.state.assets.get(String(ASSET_PETR4))?.averageCost?.amount).toBe(
        baseline.state.assets.get(String(ASSET_PETR4))?.averageCost?.amount,
      );
      expect(permutedResult.state.appliedCorporateActions).toHaveLength(3);
      expect(permutedResult.state.realizedDisposals).toHaveLength(1);
    }
  });
});
