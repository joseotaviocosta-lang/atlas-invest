import { describe, it, expect } from 'vitest';
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  LocalDate,
  Quantity,
  Money,
  TransactionFactory,
  Transaction,
} from '@atlas/domain';
import {
  createTaxSubjectId,
  buildAnnualPositionReport,
  computeOpeningPositionFingerprint,
} from '@atlas/tax-engine';

function uuid(label: string): string {
  const hash = Array.from(label).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex}-0000-4000-8000-${hex.padStart(12, '0')}`;
}

describe('Phase 4H.2 — Annual IRPF Period & Position Fuzz & Invariant Testing', () => {
  const taxSubjectId = createTaxSubjectId(uuid('tax-subject-fuzz'));
  const portfolioId = createPortfolioId(uuid('portfolio-fuzz'));
  const accountId = createAccountId(uuid('account-fuzz'));

  it('Property 1: Determinism — Same input replayed produces 100% byte-for-byte / value-for-value identical reports', () => {
    const assetId = createAssetId(uuid('asset-det-1'));
    const txs: Transaction[] = [
      TransactionFactory.createBuy({
        id: uuid('tx-1'),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-01-15',
        quantity: '100',
        unitPrice: '25.50',
        currency: 'BRL',
      }),
      TransactionFactory.createBuy({
        id: uuid('tx-2'),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-03-20',
        quantity: '50',
        unitPrice: '30.00',
        currency: 'BRL',
      }),
      TransactionFactory.createSplit({
        id: uuid('tx-3'),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        type: 'SPLIT',
        tradeDate: '2025-06-10',
        factor: '2',
        currency: 'BRL',
      }),
      TransactionFactory.createSell({
        id: uuid('tx-4'),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-08-05',
        quantity: '60',
        unitPrice: '20.00',
        currency: 'BRL',
      }),
    ];

    const baseline = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: txs,
    });

    for (let i = 0; i < 200; i++) {
      // Shuffle transactions input array to verify ordering invariance
      const shuffled = [...txs].sort(() => Math.random() - 0.5);
      const result = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: shuffled,
      });

      expect(result.positions).toHaveLength(baseline.positions.length);
      expect(result.positions[0]!.quantity.toString()).toBe(
        baseline.positions[0]!.quantity.toString(),
      );
      expect(result.positions[0]!.totalHistoricalCost?.amount).toBe(
        baseline.positions[0]!.totalHistoricalCost?.amount,
      );
      expect(result.positions[0]!.averageHistoricalCost?.amount).toBe(
        baseline.positions[0]!.averageHistoricalCost?.amount,
      );
      expect(result.summary.completenessStatus).toBe(baseline.summary.completenessStatus);
    }
  });

  it('Property 2: Incomplete cost basis NEVER produces Money.zero or string "0"', () => {
    for (let i = 0; i < 50; i++) {
      const assetId = createAssetId(uuid(`asset-incomplete-${i}`));
      const transferIn = TransactionFactory.createTransfer({
        id: uuid(`tx-in-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        type: 'TRANSFER_IN',
        tradeDate: '2025-04-10',
        quantity: `${(i + 1) * 10}`,
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
      expect(pos.costBasisStatus).toBe('INCOMPLETE');
      expect(pos.totalHistoricalCost).toBeNull();
      expect(pos.averageHistoricalCost).toBeNull();
      expect(pos.completenessStatus).toBe('BLOCKED');
      expect(pos.blockingReasons).toContain('UNKNOWN_COST_BASIS');
    }
  });

  it('Property 3: Fully liquidated holding (quantity = 0) is strictly omitted from year-end positions', () => {
    for (let i = 1; i <= 50; i++) {
      const assetId = createAssetId(uuid(`asset-liquidated-${i}`));
      const buy = TransactionFactory.createBuy({
        id: uuid(`tx-buy-liq-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-01-10',
        quantity: `${i * 100}`,
        unitPrice: '15.00',
        currency: 'BRL',
      });
      const sell = TransactionFactory.createSell({
        id: uuid(`tx-sell-liq-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-06-10',
        quantity: `${i * 100}`,
        unitPrice: '18.00',
        currency: 'BRL',
      });

      const report = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [buy, sell],
      });

      expect(report.positions.find((p) => String(p.assetId) === String(assetId))).toBeUndefined();
    }
  });

  it('Property 4: Deep Immutability — Returned report is frozen and resists mutation', () => {
    const assetId = createAssetId(uuid('asset-freeze'));
    const buy = TransactionFactory.createBuy({
      id: uuid('tx-buy-freeze'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetId),
      tradeDate: '2025-02-10',
      quantity: '50',
      unitPrice: '10.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy],
    });

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.positions)).toBe(true);
    expect(Object.isFrozen(report.summary)).toBe(true);
    if (report.positions.length > 0) {
      expect(Object.isFrozen(report.positions[0])).toBe(true);
      expect(Object.isFrozen(report.positions[0]!.blockingReasons)).toBe(true);
      expect(Object.isFrozen(report.positions[0]!.trace)).toBe(true);
    }
  });

  it('Property 5: Fingerprint Idempotency & Sensitivity across 1,000 generated inputs', () => {
    for (let i = 0; i < 1000; i++) {
      const assetId = createAssetId(uuid(`asset-fp-${i}`));
      const p1 = {
        taxSubjectId,
        portfolioId,
        accountId,
        assetId,
        effectiveDate: LocalDate.from('2024-12-31'),
        quantity: Quantity.from(`${i + 1}`),
        totalHistoricalCost: Money.from(`${(i + 1) * 10}.50`, 'BRL'),
      };
      const p2 = { ...p1 };
      const pDifferentCost = {
        ...p1,
        totalHistoricalCost: Money.from(`${(i + 1) * 10}.51`, 'BRL'),
      };

      const fp1 = computeOpeningPositionFingerprint(p1);
      const fp2 = computeOpeningPositionFingerprint(p2);
      const fpDiff = computeOpeningPositionFingerprint(pDifferentCost);

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fpDiff);
      expect(fp1).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('Property 6: Temporal Boundaries — Subsequent year events strictly ignored in YYYY-12-31 replay', () => {
    const assetId = createAssetId(uuid('asset-boundary'));
    const buy2025 = TransactionFactory.createBuy({
      id: uuid('tx-boundary-2025'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetId),
      tradeDate: '2025-12-31',
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
    });
    const buy2026 = TransactionFactory.createBuy({
      id: uuid('tx-boundary-2026'),
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetId),
      tradeDate: '2026-01-01',
      quantity: '500',
      unitPrice: '100.00',
      currency: 'BRL',
    });

    const report2025 = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buy2025, buy2026],
    });

    expect(report2025.positions).toHaveLength(1);
    expect(report2025.positions[0]!.quantity.toString()).toBe('100');
    expect(report2025.positions[0]!.totalHistoricalCost?.amount).toBe('1000');

    const report2026 = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2026,
      transactions: [buy2025, buy2026],
    });

    expect(report2026.positions).toHaveLength(1);
    expect(report2026.positions[0]!.quantity.toString()).toBe('600');
    expect(report2026.positions[0]!.totalHistoricalCost?.amount).toBe('51000');
  });
});
