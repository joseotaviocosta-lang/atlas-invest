import { describe, it, expect } from 'vitest';
import {
  createAssetId,
  createPortfolioId,
  createAccountId,
  LocalDate,
  TransactionFactory,
} from '@atlas/domain';
import { derivePerformanceAssetUniverse } from '@atlas/portfolio-engine';

describe('Phase 5B — Performance Asset Universe', () => {
  const portfolioId = createPortfolioId('c0000000-0000-4000-8000-000000000001');
  const accountId = createAccountId('d0000000-0000-4000-8000-000000000001');
  const petr4 = createAssetId('e0000000-0000-4000-8000-000000000001');
  const vale3 = createAssetId('e0000000-0000-4000-8000-000000000002');
  const itub4 = createAssetId('e0000000-0000-4000-8000-000000000003');
  const bbdc4 = createAssetId('e0000000-0000-4000-8000-000000000004');

  it('rejects inverted range (from > to)', () => {
    expect(() =>
      derivePerformanceAssetUniverse({
        transactions: [],
        from: LocalDate.from('2026-10-15'),
        to: LocalDate.from('2026-01-01'),
      }),
    ).toThrow(/cannot be after/);
  });

  it('includes currently held assets and assets sold within requested period, but excludes assets sold before or bought after', () => {
    // 1. PETR4: Bought in 2025, held continuously through 2026
    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: petr4,
      tradeDate: LocalDate.from('2025-06-01'),
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });

    // 2. VALE3: Bought in Jan 2026, sold completely in May 2026 (sold within 2026 period!)
    const tx2 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: vale3,
      tradeDate: LocalDate.from('2026-01-15'),
      quantity: '50',
      unitPrice: '60.00',
      currency: 'BRL',
    });
    const tx3 = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId: vale3,
      tradeDate: LocalDate.from('2026-05-20'),
      quantity: '50',
      unitPrice: '70.00',
      currency: 'BRL',
    });

    // 3. ITUB4: Bought in 2024, sold completely in 2024 (BEFORE period)
    const tx4 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: itub4,
      tradeDate: LocalDate.from('2024-03-01'),
      quantity: '200',
      unitPrice: '20.00',
      currency: 'BRL',
    });
    const tx5 = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId: itub4,
      tradeDate: LocalDate.from('2024-11-01'),
      quantity: '200',
      unitPrice: '25.00',
      currency: 'BRL',
    });

    // 4. BBDC4: Bought in 2027 (AFTER period)
    const tx6 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: bbdc4,
      tradeDate: LocalDate.from('2027-02-01'),
      quantity: '100',
      unitPrice: '15.00',
      currency: 'BRL',
    });

    const txs = [tx1, tx2, tx3, tx4, tx5, tx6];

    // Requested period: 2026-01-01 to 2026-10-15
    const universe = derivePerformanceAssetUniverse({
      portfolioId: String(portfolioId),
      transactions: txs,
      from: LocalDate.from('2026-01-01'),
      to: LocalDate.from('2026-10-15'),
    });

    const universeIds = universe.map((id) => String(id));

    // PETR4 held throughout -> MUST be in universe
    expect(universeIds).toContain(String(petr4));

    // VALE3 bought and sold in 2026 -> MUST be in universe
    expect(universeIds).toContain(String(vale3));

    // ITUB4 sold in 2024 -> MUST NOT be in universe
    expect(universeIds).not.toContain(String(itub4));

    // BBDC4 bought in 2027 -> MUST NOT be in universe
    expect(universeIds).not.toContain(String(bbdc4));

    expect(universeIds.length).toBe(2);
  });

  it('includes asset bought before period and sold on the exact start date', () => {
    // Bought in 2025, sold on 2026-01-01 (start date)
    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: petr4,
      tradeDate: LocalDate.from('2025-06-01'),
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });
    const tx2 = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId: petr4,
      tradeDate: LocalDate.from('2026-01-01'),
      quantity: '100',
      unitPrice: '35.00',
      currency: 'BRL',
    });

    const universe = derivePerformanceAssetUniverse({
      portfolioId: String(portfolioId),
      transactions: [tx1, tx2],
      from: LocalDate.from('2026-01-01'),
      to: LocalDate.from('2026-06-30'),
    });

    expect(universe.map((id) => String(id))).toContain(String(petr4));
  });
});
