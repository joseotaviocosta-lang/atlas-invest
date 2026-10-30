import { describe, it, expect } from 'vitest';
import { createAssetId } from '@atlas/domain';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ASSET_HGLG11, ACCOUNT_XP, ACCOUNT_NU } from '../fixtures/assets';

/**
 * RECEIPT_CONVERSION replay matrix (PART K–Q, X).
 * Source = PETR4-shaped receipt, target = HGLG11-shaped parent unless noted.
 * All expectations use exact decimal strings; zero floats.
 */
const SRC = ASSET_PETR4;
const DST = ASSET_HGLG11;

describe('Receipt conversion replay', () => {
  it('1:1 known-cost conversion carries total cost exactly and closes source', () => {
    const result = scenario()
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.50', tradeDate: '2026-01-05' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    expect(result.state.assets.has(String(SRC))).toBe(false);
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('200');
    expect(dst.totalCost?.amount).toBe('1700');
    expect(dst.averageCost?.amount).toBe('8.5');
    expect(dst.costBasisStatus).toBe('KNOWN');
    expect(result.state.realizedDisposals).toHaveLength(0);
    expect(result.state.incomeEvents).toHaveLength(0);
    const [ca] = result.state.appliedCorporateActions;
    expect(ca!.type).toBe('RECEIPT_CONVERSION');
    expect(String(ca!.targetAssetId)).toBe(String(DST));
  });

  it('incomplete source propagates INCOMPLETE to a KNOWN target (never zero)', () => {
    const result = scenario()
      .buy({ assetId: DST, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .transferIn({ assetId: SRC, quantity: '200', tradeDate: '2026-01-06' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('300');
    expect(dst.costBasisStatus).toBe('INCOMPLETE');
    expect(dst.totalCost).toBeUndefined();
    expect(dst.averageCost).toBeUndefined();
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('known source into INCOMPLETE target keeps target INCOMPLETE', () => {
    const result = scenario()
      .transferIn({ assetId: DST, quantity: '50', tradeDate: '2026-01-05' })
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.50', tradeDate: '2026-01-06' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('250');
    expect(dst.costBasisStatus).toBe('INCOMPLETE');
    expect(dst.totalCost).toBeUndefined();
  });

  it('KNOWN + KNOWN merge sums costs exactly', () => {
    const result = scenario()
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.50', tradeDate: '2026-01-05' })
      .buy({ assetId: DST, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-06' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('300');
    expect(dst.totalCost?.amount).toBe('2700');
    expect(dst.costBasisStatus).toBe('KNOWN');
  });

  it('partial KNOWN conversion keeps source average and transfers proportionally', () => {
    const result = scenario()
      .buy({ assetId: SRC, quantity: '300', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    const src = result.state.assets.get(String(SRC))!;
    expect(src.quantity.value).toBe('100');
    expect(src.totalCost?.amount).toBe('1000');
    expect(src.averageCost?.amount).toBe('10');
    expect(src.costBasisStatus).toBe('KNOWN');
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('200');
    expect(dst.totalCost?.amount).toBe('2000');
  });

  it('partial INCOMPLETE conversion leaves both sides INCOMPLETE', () => {
    const result = scenario()
      .transferIn({ assetId: SRC, quantity: '300', tradeDate: '2026-01-05' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    const src = result.state.assets.get(String(SRC))!;
    expect(src.quantity.value).toBe('100');
    expect(src.costBasisStatus).toBe('INCOMPLETE');
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('200');
    expect(dst.costBasisStatus).toBe('INCOMPLETE');
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('insufficient source quantity fails closed (never negative)', () => {
    const t = () =>
      scenario()
        .buy({ assetId: SRC, quantity: '100', unitPrice: '8.50', tradeDate: '2026-01-05' })
        .receiptConversion({
          assetId: SRC,
          targetAssetId: DST,
          quantity: '200',
          tradeDate: '2026-02-01',
        })
        .replay();
    expect(t).toThrow(/requires source quantity/);
    const t2 = () =>
      scenario()
        .receiptConversion({
          assetId: createAssetId('e0000000-0000-4000-8000-000000000099'),
          targetAssetId: DST,
          quantity: '10',
          tradeDate: '2026-02-01',
        })
        .replay();
    expect(t2).toThrow(/requires source quantity/);
  });

  it('same-asset conversion is rejected at the factory', () => {
    const t = () =>
      scenario()
        .receiptConversion({
          assetId: SRC,
          targetAssetId: SRC,
          quantity: '10',
          tradeDate: '2026-02-01',
        })
        .replay();
    expect(t).toThrow(/must differ/);
  });

  it('ratio mismatch is rejected at the factory', () => {
    const t = () =>
      scenario()
        .receiptConversion({
          assetId: SRC,
          targetAssetId: DST,
          quantity: '200',
          targetQuantity: '201',
          conversionRatio: '1',
          tradeDate: '2026-02-01',
        })
        .replay();
    expect(t).toThrow(/CONVERSION_RATIO_MISMATCH/);
  });

  it('non-1:1 ratio converts proportionally (2:1 bonus-style)', () => {
    const result = scenario()
      .buy({ assetId: SRC, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '100',
        targetQuantity: '200',
        conversionRatio: '2',
        tradeDate: '2026-02-01',
      })
      .replay();
    expect(result.state.assets.has(String(SRC))).toBe(false);
    const dst = result.state.assets.get(String(DST))!;
    expect(dst.quantity.value).toBe('200');
    expect(dst.totalCost?.amount).toBe('1000');
    expect(dst.averageCost?.amount).toBe('5');
  });

  it('conversion is account-scoped: sibling account positions are untouched', () => {
    const result = scenario()
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.00', tradeDate: '2026-01-05' })
      .buy({
        assetId: SRC,
        quantity: '50',
        unitPrice: '9.00',
        tradeDate: '2026-01-06',
        accountId: ACCOUNT_NU,
      })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    // XP leg converted; NU keeps its own 50-unit receipt position.
    const nu = result.state.accounts.get(String(ACCOUNT_NU))!;
    expect(nu.assets.get(String(SRC))!.quantity.value).toBe('50');
    expect(nu.assets.has(String(DST))).toBe(false);
    const xp = result.state.accounts.get(String(ACCOUNT_XP))!;
    expect(xp.assets.has(String(SRC))).toBe(false);
    expect(xp.assets.get(String(DST))!.quantity.value).toBe('200');
  });

  it('currency mismatch between source position and event fails closed', () => {
    const t = () =>
      scenario()
        .buy({
          assetId: SRC,
          quantity: '200',
          unitPrice: '8.50',
          currency: 'USD',
          tradeDate: '2026-01-05',
        })
        .receiptConversion({
          assetId: SRC,
          targetAssetId: DST,
          quantity: '200',
          currency: 'BRL',
          tradeDate: '2026-02-01',
        })
        .replay();
    expect(t).toThrow();
  });

  it('PART X: effective date is material — SELL interleaved before/after conversion changes realized gain', () => {
    const sellFirst = scenario()
      .buy({ assetId: DST, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.00', tradeDate: '2026-01-06' })
      .sell({ assetId: DST, quantity: '50', unitPrice: '12.00', tradeDate: '2026-01-20' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-02-01',
      })
      .replay();
    const convertFirst = scenario()
      .buy({ assetId: DST, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.00', tradeDate: '2026-01-06' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-01-10',
      })
      .sell({ assetId: DST, quantity: '50', unitPrice: '12.00', tradeDate: '2026-01-20' })
      .replay();
    const gainSellFirst = sellFirst.state.realizedDisposals[0]!.realizedGainLoss!.amount;
    const gainConvertFirst = convertFirst.state.realizedDisposals[0]!.realizedGainLoss!.amount;
    // sell-first removes at avg 10.00 → gain 100; convert-first removes at avg
    // (1000+1600)/300 = 8.666... → different gain. Exact date decides.
    expect(gainSellFirst).toBe('100');
    expect(gainConvertFirst).not.toBe('100');
    // Determinism: identical inputs replay identically (canonical ordering).
    const replayed = scenario()
      .buy({ assetId: DST, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .buy({ assetId: SRC, quantity: '200', unitPrice: '8.00', tradeDate: '2026-01-06' })
      .receiptConversion({
        assetId: SRC,
        targetAssetId: DST,
        quantity: '200',
        tradeDate: '2026-01-10',
      })
      .sell({ assetId: DST, quantity: '50', unitPrice: '12.00', tradeDate: '2026-01-20' })
      .replay();
    expect(replayed.state.realizedDisposals[0]!.realizedGainLoss!.amount).toBe(gainConvertFirst);
  });
});
