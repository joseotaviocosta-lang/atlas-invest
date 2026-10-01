import { describe, it, expect } from 'vitest';
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  LocalDate,
  Money,
  Quantity,
  TransactionFactory,
} from '@atlas/domain';
import {
  buildAnnualPositionReport,
  createAnnualOpeningPosition,
  createAnnualTaxPeriod,
  createCalendarYear,
  createDeclarationExercise,
  createTaxSubjectId,
  InvalidCalendarYearError,
  InvalidDeclarationExerciseError,
  resolveDeclarationExercise,
} from '@atlas/tax-engine';
import { uuidFor } from './helpers';

describe('Phase 4H.2 — Annual IRPF Period & Position Fixtures (A through W)', () => {
  const taxSubjectId = createTaxSubjectId(uuidFor('user-test-subject-4h2'));
  const portfolioId = createPortfolioId(uuidFor('portfolio-test-4h2'));
  const accountId = createAccountId(uuidFor('account-test-4h2'));
  const assetIdA = createAssetId(uuidFor('asset-petr4'));
  const assetIdB = createAssetId(uuidFor('asset-vale3'));

  it('Fixture A: Pure holding with single buy before year-end -> COMPLETE with exact quantity and historical cost', () => {
    const buyTx = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-03-10',
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buyTx],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(String(pos.assetId)).toBe(String(assetIdA));
    expect(pos.quantity.toString()).toBe('100');
    expect(pos.totalHistoricalCost?.amount).toBe('3000');
    expect(pos.averageHistoricalCost?.amount).toBe('30');
    expect(pos.costBasisStatus).toBe('KNOWN');
    expect(pos.completenessStatus).toBe('COMPLETE');
    expect(pos.blockingReasons).toHaveLength(0);
    expect(report.summary.completenessStatus).toBe('COMPLETE');
    expect(report.summary.totalHistoricalCostKnown?.amount).toBe('3000');
  });

  it('Fixture B: Multiple buys with weighted average cost -> COMPLETE with exact aggregated cost', () => {
    const buy1 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-01-15',
      quantity: '100',
      unitPrice: '20.00',
      currency: 'BRL',
    });
    const buy2 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-2'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-06-20',
      quantity: '100',
      unitPrice: '40.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy1, buy2],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('200');
    expect(pos.totalHistoricalCost?.amount).toBe('6000');
    expect(pos.averageHistoricalCost?.amount).toBe('30');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture C: Holding partially sold before year-end -> remaining quantity with exact remaining historical cost', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-01-15',
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });
    const sell = TransactionFactory.createSell({
      id: uuidFor('tx-sell-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-08-10',
      quantity: '40',
      unitPrice: '50.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, sell],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('60');
    expect(pos.totalHistoricalCost?.amount).toBe('1800');
    expect(pos.averageHistoricalCost?.amount).toBe('30');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture D: Holding fully liquidated before year-end (quantity = 0) -> omitted from 31/12 positions list', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-01-15',
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });
    const sell = TransactionFactory.createSell({
      id: uuidFor('tx-sell-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-11-20',
      quantity: '100',
      unitPrice: '45.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, sell],
    });

    expect(report.positions).toHaveLength(0);
    expect(report.summary.totalAssetsCount).toBe(0);
    expect(report.summary.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture E: Incomplete cost basis (transfer-in without carried cost) -> costBasisStatus = INCOMPLETE, totalHistoricalCost = null, BLOCKED', () => {
    const transferIn = TransactionFactory.createTransfer({
      id: uuidFor('tx-transfer-in-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      type: 'TRANSFER_IN',
      tradeDate: '2025-04-12',
      quantity: '150',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [transferIn],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('150');
    expect(pos.totalHistoricalCost).toBeNull();
    expect(pos.averageHistoricalCost).toBeNull();
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.completenessStatus).toBe('BLOCKED');
    expect(pos.blockingReasons).toContain('UNKNOWN_COST_BASIS');
    expect(report.summary.completenessStatus).toBe('BLOCKED');
    expect(report.summary.totalHistoricalCostKnown).toBeNull();
  });

  it('Fixture F: Pre-Atlas confirmed opening position with no ledger transactions -> applied as base holding, COMPLETE', () => {
    const opening = createAnnualOpeningPosition({
      id: uuidFor('op-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('500'),
      totalHistoricalCost: Money.from('15000', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 1,
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [],
      openingPositions: [opening],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('500');
    expect(pos.totalHistoricalCost?.amount).toBe('15000');
    expect(pos.averageHistoricalCost?.amount).toBe('30');
    expect(pos.openingPositionApplied).toBe(true);
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture G: Pre-Atlas confirmed opening position + subsequent buy in ledger -> base quantity/cost + buy added, COMPLETE', () => {
    const opening = createAnnualOpeningPosition({
      id: uuidFor('op-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('2000', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 1,
    });

    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-05-10',
      quantity: '100',
      unitPrice: '40.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy],
      openingPositions: [opening],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('200');
    expect(pos.totalHistoricalCost?.amount).toBe('6000');
    expect(pos.averageHistoricalCost?.amount).toBe('30');
    expect(pos.openingPositionApplied).toBe(true);
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture H: Pre-Atlas confirmed opening position + subsequent sell in ledger -> weighted average cost reduction', () => {
    const opening = createAnnualOpeningPosition({
      id: uuidFor('op-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('200'),
      totalHistoricalCost: Money.from('6000', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 1,
    });

    const sell = TransactionFactory.createSell({
      id: uuidFor('tx-sell-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-07-15',
      quantity: '50',
      unitPrice: '50.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [sell],
      openingPositions: [opening],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('150');
    expect(pos.totalHistoricalCost?.amount).toBe('4500');
    expect(pos.averageHistoricalCost?.amount).toBe('30');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture I: Overlapping opening position and ledger transactions (ledger transaction on/before opening date) -> OVERLAPPING_OPENING_AND_LEDGER_HISTORY, BLOCKED', () => {
    const opening = createAnnualOpeningPosition({
      id: uuidFor('op-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('2000', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 1,
    });

    const oldTx = TransactionFactory.createBuy({
      id: uuidFor('tx-old-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2024-10-15',
      quantity: '50',
      unitPrice: '20.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [oldTx],
      openingPositions: [opening],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.completenessStatus).toBe('BLOCKED');
    expect(pos.blockingReasons).toContain('OVERLAPPING_OPENING_AND_LEDGER_HISTORY');
    expect(pos.openingPositionApplied).toBe(false);
  });

  it('Fixture J: Draft (unconfirmed) opening position -> UNCONFIRMED_OPENING_POSITION, REQUIRES_CONFIRMATION', () => {
    const draftOpening = createAnnualOpeningPosition({
      id: uuidFor('op-draft-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('2000', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'DRAFT',
      revision: 1,
    });

    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-02-10',
      quantity: '50',
      unitPrice: '30.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy],
      openingPositions: [draftOpening],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.completenessStatus).toBe('REQUIRES_CONFIRMATION');
    expect(pos.blockingReasons).toContain('UNCONFIRMED_OPENING_POSITION');
  });

  it('Fixture K: Multi-asset portfolio (mix of COMPLETE and BLOCKED) -> summary has PARTIAL and null total known cost', () => {
    const buyA = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-a'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-01-10',
      quantity: '100',
      unitPrice: '20.00',
      currency: 'BRL',
    });
    const transferInB = TransactionFactory.createTransfer({
      id: uuidFor('tx-in-b'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdB),
      type: 'TRANSFER_IN',
      tradeDate: '2025-02-10',
      quantity: '50',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buyA, transferInB],
    });

    expect(report.positions).toHaveLength(2);
    expect(report.summary.totalAssetsCount).toBe(2);
    expect(report.summary.completePositionsCount).toBe(1);
    expect(report.summary.blockedPositionsCount).toBe(1);
    expect(report.summary.completenessStatus).toBe('PARTIAL');
    expect(report.summary.totalHistoricalCostKnown).toBeNull();
  });

  it('Fixture L: Split (desdobramento 1:2) during calendar year -> quantity doubled, total cost preserved, average cost halved', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-02-01',
      quantity: '100',
      unitPrice: '40.00',
      currency: 'BRL',
    });
    const split = TransactionFactory.createSplit({
      id: uuidFor('tx-split-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      type: 'SPLIT',
      tradeDate: '2025-06-01',
      factor: '2',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, split],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('200');
    expect(pos.totalHistoricalCost?.amount).toBe('4000');
    expect(pos.averageHistoricalCost?.amount).toBe('20');
    expect(pos.completenessStatus).toBe('COMPLETE');
    expect(pos.trace.corporateActionCount).toBe(1);
  });

  it('Fixture M: Reverse split (grupamento 10:1) during calendar year -> quantity divided by 10, total cost preserved', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-01-10',
      quantity: '1000',
      unitPrice: '5.00',
      currency: 'BRL',
    });
    const reverseSplit = TransactionFactory.createSplit({
      id: uuidFor('tx-rev-split-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      type: 'REVERSE_SPLIT',
      tradeDate: '2025-05-15',
      factor: '10',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, reverseSplit],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('100');
    expect(pos.totalHistoricalCost?.amount).toBe('5000');
    expect(pos.averageHistoricalCost?.amount).toBe('50');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture N: Bonificação during calendar year with assigned cost -> quantity increased, assigned cost added to total cost', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-02-01',
      quantity: '100',
      unitPrice: '20.00',
      currency: 'BRL',
    });
    const bonus = TransactionFactory.createBonus({
      id: uuidFor('tx-bonus-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-07-01',
      quantity: '10',
      assignedCost: '250.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, bonus],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('110');
    expect(pos.totalHistoricalCost?.amount).toBe('2250');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture O: Amortization of principal during calendar year -> quantity unchanged, total cost reduced', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-01-10',
      quantity: '100',
      unitPrice: '100.00',
      currency: 'BRL',
    });
    const amortization = TransactionFactory.createAmortization({
      id: uuidFor('tx-amort-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-09-01',
      amount: '1000.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, amortization],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('100');
    expect(pos.totalHistoricalCost?.amount).toBe('9000');
    expect(pos.averageHistoricalCost?.amount).toBe('90');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture P: Multi-account portfolio custody -> assets aggregated at portfolio level deterministically', () => {
    const accountId2 = createAccountId(uuidFor('account-test-4h2-secondary'));
    const buyAcc1 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-acc1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-03-01',
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });
    const buyAcc2 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-acc2'),
      portfolioId: String(portfolioId),
      accountId: String(accountId2),
      assetId: String(assetIdA),
      tradeDate: '2025-04-01',
      quantity: '100',
      unitPrice: '40.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buyAcc1, buyAcc2],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('200');
    expect(pos.totalHistoricalCost?.amount).toBe('7000');
    expect(pos.averageHistoricalCost?.amount).toBe('35');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture Q: Cross-year boundary -> 2025 report includes ONLY events with tradeDate <= 2025-12-31', () => {
    const buy2024 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-2024'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2024-11-15',
      quantity: '100',
      unitPrice: '20.00',
      currency: 'BRL',
    });
    const buy2025 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-2025'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-06-15',
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });
    const buy2026 = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-2026'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2026-02-15',
      quantity: '100',
      unitPrice: '50.00',
      currency: 'BRL',
    });

    const report2025 = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy2024, buy2025, buy2026],
    });

    expect(report2025.positions).toHaveLength(1);
    const pos = report2025.positions[0]!;
    expect(pos.quantity.toString()).toBe('200'); // buy2024 + buy2025, 2026 excluded
    expect(pos.totalHistoricalCost?.amount).toBe('5000');
    expect(pos.averageHistoricalCost?.amount).toBe('25');
  });

  it('Fixture R: Idempotency of opening position fingerprint -> same inputs produce identical SHA-256 fingerprint', () => {
    const op1 = createAnnualOpeningPosition({
      id: uuidFor('op-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('2500', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 1,
    });
    const op2 = createAnnualOpeningPosition({
      id: uuidFor('op-2'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('2500', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 1,
    });

    expect(op1.fingerprint).toBe(op2.fingerprint);
    expect(op1.fingerprint).toHaveLength(64);
  });

  it('Fixture S: Revision increment of opening position -> revision 2 with new cost replaces revision 1', () => {
    const opRev1 = createAnnualOpeningPosition({
      id: uuidFor('op-1'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('2000', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'SUPERSEDED',
      revision: 1,
    });
    const opRev2 = createAnnualOpeningPosition({
      id: uuidFor('op-2'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('100'),
      totalHistoricalCost: Money.from('3500', 'BRL'),
      currency: 'BRL',
      source: 'MANUAL_CONFIRMED',
      status: 'CONFIRMED',
      revision: 2,
      supersedesId: uuidFor('op-1'),
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [],
      openingPositions: [opRev1, opRev2],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.totalHistoricalCost?.amount).toBe('3500');
    expect(pos.averageHistoricalCost?.amount).toBe('35');
    expect(pos.openingPositionId).toBe(uuidFor('op-2'));
  });

  it('Fixture T: Temporal types validation (CalendarYear vs DeclarationExercise)', () => {
    const calYear = createCalendarYear(2025);
    const exercise = resolveDeclarationExercise(calYear);
    expect(Number(calYear)).toBe(2025);
    expect(Number(exercise)).toBe(2026);

    const period = createAnnualTaxPeriod(calYear);
    expect(period.calendarYear).toBe(calYear);
    expect(period.declarationExercise).toBe(exercise);
    expect(period.startDate.toString()).toBe('2025-01-01');
    expect(period.endDate.toString()).toBe('2025-12-31');
  });

  it('Fixture U: Rejection of invalid calendar years (< 1900 or > 2100)', () => {
    expect(() => createCalendarYear(1899)).toThrow(InvalidCalendarYearError);
    expect(() => createCalendarYear(2101)).toThrow(InvalidCalendarYearError);
    expect(() => createCalendarYear(2025.5)).toThrow(InvalidCalendarYearError);
    expect(() => createDeclarationExercise(1899)).toThrow(InvalidDeclarationExerciseError);
  });

  it('Fixture V: Zero cost asset (donation/free share) -> totalHistoricalCost is Money.zero, not null', () => {
    const openingPos = createAnnualOpeningPosition({
      id: uuidFor('open-zero-cost'),
      taxSubjectId,
      portfolioId,
      accountId,
      assetId: assetIdA,
      effectiveDate: LocalDate.from('2024-12-31'),
      quantity: Quantity.from('50'),
      totalHistoricalCost: Money.from('0', 'BRL'),
      currency: 'BRL',
      status: 'CONFIRMED',
      source: 'MANUAL_CONFIRMED',
      revision: 1,
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [],
      openingPositions: [openingPos],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('50');
    expect(pos.totalHistoricalCost).not.toBeNull();
    expect(pos.totalHistoricalCost?.amount).toBe('0');
    expect(pos.costBasisStatus).toBe('KNOWN');
    expect(pos.completenessStatus).toBe('COMPLETE');
  });

  it('Fixture W: Trace provenance summary correctness', () => {
    const buy = TransactionFactory.createBuy({
      id: uuidFor('tx-buy-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      tradeDate: '2025-03-10',
      quantity: '100',
      unitPrice: '25.00',
      currency: 'BRL',
    });
    const split = TransactionFactory.createSplit({
      id: uuidFor('tx-split-1'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetIdA),
      type: 'SPLIT',
      tradeDate: '2025-07-01',
      factor: '2',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy, split],
    });

    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.trace.appliedTransactionCount).toBe(2);
    expect(pos.trace.corporateActionCount).toBe(1);
    expect(pos.trace.openingPositionApplied).toBe(false);
    expect(pos.trace.provenanceSummary).toContain('2 ledger transactions (1 corporate actions)');
  });
});
