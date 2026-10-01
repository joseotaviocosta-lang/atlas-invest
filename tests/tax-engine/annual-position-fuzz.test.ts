import { describe, it, expect } from 'vitest';
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  LocalDate,
  Quantity,
  Money,
  TransactionFactory,
} from '@atlas/domain';
import {
  createTaxSubjectId,
  buildAnnualPositionReport,
  createAnnualOpeningPosition,
} from '@atlas/tax-engine';

function uuid(label: string): string {
  const hash = Array.from(label).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex}-0000-4000-8000-${hex.padStart(12, '0')}`;
}

// Deterministic Pseudo-Random Generator (Linear Congruential Generator)
class SeededRng {
  private state: number;
  constructor(public readonly seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

describe('Phase 4H.2 — Annual IRPF Period & Position Fuzz & Invariant Testing (10,000 Cases)', () => {
  const taxSubjectId = createTaxSubjectId(uuid('tax-subject-fuzz-seed'));
  const portfolioId = createPortfolioId(uuid('portfolio-fuzz-seed'));
  const accountId = createAccountId(uuid('account-fuzz-seed'));
  const FUZZ_SEED = 133742;

  it('10,000-Case Fuzz Matrix (Seed: 133742) — Verifies all 6 required annual invariants', () => {
    const rng = new SeededRng(FUZZ_SEED);
    const startMs = Date.now();
    let invariant1Passed = 0;
    let invariant2Passed = 0;
    let invariant3Passed = 0;
    let invariant4Passed = 0;
    let invariant5Passed = 0;
    let invariant6Passed = 0;

    for (let i = 0; i < 10000; i++) {
      const assetId = createAssetId(uuid(`asset-fuzz-${i % 100}`));
      const qty1 = rng.nextInt(10, 500);
      const price1 = rng.nextInt(5, 100);
      const buy1 = TransactionFactory.createBuy({
        id: uuid(`tx-fuzz-buy1-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-01-15',
        quantity: `${qty1}`,
        unitPrice: `${price1}.00`,
        currency: 'BRL',
      });

      // Invariant 1: Same input -> same output (determinism)
      const reportA = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [buy1],
      });
      const reportB = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [buy1],
      });
      expect(reportA.summary.completenessStatus).toBe(reportB.summary.completenessStatus);
      expect(reportA.positions[0]!.quantity.toString()).toBe(
        reportB.positions[0]!.quantity.toString(),
      );
      invariant1Passed++;

      // Invariant 2: Unknown cost basis never becomes zero or string "0"
      const transferIn = TransactionFactory.createTransfer({
        id: uuid(`tx-fuzz-in-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        type: 'TRANSFER_IN',
        tradeDate: '2025-03-10',
        quantity: `${qty1}`,
        currency: 'BRL',
      });
      const repUnknown = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [transferIn],
      });
      expect(repUnknown.positions[0]!.costBasisStatus).toBe('INCOMPLETE');
      expect(repUnknown.positions[0]!.totalHistoricalCost).toBeNull();
      expect(repUnknown.positions[0]!.averageHistoricalCost).toBeNull();
      expect(repUnknown.positions[0]!.completenessStatus).toBe('BLOCKED');
      invariant2Passed++;

      // Invariant 3: Duplicate opening input never double-counts
      const op1 = createAnnualOpeningPosition({
        id: uuid(`op-fuzz-1-${i}`),
        taxSubjectId,
        portfolioId,
        accountId,
        assetId,
        effectiveDate: LocalDate.from('2024-12-31'),
        quantity: Quantity.from(`${qty1}`),
        totalHistoricalCost: Money.from(`${qty1 * price1}`, 'BRL'),
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'CONFIRMED',
        revision: 1,
      });
      const op2 = createAnnualOpeningPosition({
        id: uuid(`op-fuzz-2-${i}`),
        taxSubjectId,
        portfolioId,
        accountId,
        assetId,
        effectiveDate: LocalDate.from('2024-12-31'),
        quantity: Quantity.from(`${qty1}`),
        totalHistoricalCost: Money.from(`${qty1 * price1}`, 'BRL'),
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'CONFIRMED',
        revision: 1,
      });
      expect(op1.fingerprint).toBe(op2.fingerprint);
      const repOp = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [],
        openingPositions: [op1, op2],
      });
      expect(repOp.positions).toHaveLength(1);
      expect(repOp.positions[0]!.quantity.toString()).toBe(`${qty1}`); // NOT 2 * qty1
      invariant3Passed++;

      // Invariant 4: Quantity conservation where applicable (buy qty1, sell qtySold => remaining = qty1 - qtySold)
      const sellQty = rng.nextInt(1, qty1);
      const sellTx = TransactionFactory.createSell({
        id: uuid(`tx-fuzz-sell-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2025-06-15',
        quantity: `${sellQty}`,
        unitPrice: '50.00',
        currency: 'BRL',
      });
      const repConserve = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [buy1, sellTx],
      });
      const expectedRemaining = qty1 - sellQty;
      if (expectedRemaining > 0) {
        expect(repConserve.positions[0]!.quantity.toString()).toBe(`${expectedRemaining}`);
      } else {
        expect(repConserve.positions).toHaveLength(0); // 0 quantity strictly omitted
      }
      invariant4Passed++;

      // Invariant 5: Year boundary deterministic (2025-12-31 included in 2025, 2026-01-01 excluded)
      const nextYearBuy = TransactionFactory.createBuy({
        id: uuid(`tx-fuzz-next-${i}`),
        portfolioId: String(portfolioId),
        accountId: String(accountId),
        assetId: String(assetId),
        tradeDate: '2026-01-01',
        quantity: '999',
        unitPrice: '10.00',
        currency: 'BRL',
      });
      const repBoundary2025 = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: [buy1, nextYearBuy],
      });
      expect(repBoundary2025.positions[0]!.quantity.toString()).toBe(`${qty1}`);
      invariant5Passed++;

      // Invariant 6: Canonical ordering deterministic (shuffling input array does not alter output)
      const shuffledTxs = [nextYearBuy, buy1].sort(() => (rng.next() > 0.5 ? 1 : -1));
      const repShuffled = buildAnnualPositionReport({
        taxSubjectId,
        portfolioId,
        calendarYear: 2025,
        transactions: shuffledTxs,
      });
      expect(repShuffled.positions[0]!.quantity.toString()).toBe(
        repBoundary2025.positions[0]!.quantity.toString(),
      );
      invariant6Passed++;
    }

    const duration = Date.now() - startMs;
    expect(invariant1Passed).toBe(10000);
    expect(invariant2Passed).toBe(10000);
    expect(invariant3Passed).toBe(10000);
    expect(invariant4Passed).toBe(10000);
    expect(invariant5Passed).toBe(10000);
    expect(invariant6Passed).toBe(10000);
    expect(duration).toBeGreaterThan(0);
  }, 30000);
});
