import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Asset, TransactionFactory } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from './setup';
import { TransactionRepository, AssetRepository } from '../../packages/database/src';

describe('Database Integration: 17 Transaction Types Ledger Round-Trip', () => {
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);
  const assetRepo = new AssetRepository(prisma);

  let portfolioId: string;
  let accountId: string;
  let assetId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;

    const asset = await assetRepo.create(
      Asset.create({
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );
    assetId = asset.id;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('1. BUY transaction round-trip', async () => {
    const tx = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId,
      quantity: '100',
      unitPrice: '65.50',
      currency: 'BRL',
      fees: '2.50',
      taxes: '1.20',
      tradeDate: '2026-03-01',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'BUY').toBe(true);
    if (r && r.type === 'BUY') {
      expect(r.quantity.value).toBe('100');
      expect(r.unitPrice.amount).toBe('65.5');
      expect(r.fees?.amount).toBe('2.5');
      expect(r.taxes?.amount).toBe('1.2');
    }
  });

  it('2. SELL transaction round-trip', async () => {
    const tx = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId,
      quantity: '50',
      unitPrice: '70.00',
      currency: 'BRL',
      fees: '1.50',
      tradeDate: '2026-03-02',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'SELL').toBe(true);
    if (r && r.type === 'SELL') {
      expect(r.quantity.value).toBe('50');
      expect(r.unitPrice.amount).toBe('70');
      expect(r.fees?.amount).toBe('1.5');
    }
  });

  it('3. DIVIDEND transaction round-trip', async () => {
    const tx = TransactionFactory.createIncome({
      portfolioId,
      accountId,
      assetId,
      type: 'DIVIDEND',
      amount: '250.75',
      currency: 'BRL',
      tradeDate: '2026-03-03',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'DIVIDEND').toBe(true);
    if (r && r.type === 'DIVIDEND') {
      expect(r.amount.amount).toBe('250.75');
    }
  });

  it('4. JCP transaction round-trip', async () => {
    const tx = TransactionFactory.createIncome({
      portfolioId,
      accountId,
      assetId,
      type: 'JCP',
      amount: '180.20',
      currency: 'BRL',
      tradeDate: '2026-03-04',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'JCP').toBe(true);
    if (r && r.type === 'JCP') {
      expect(r.amount.amount).toBe('180.2');
    }
  });

  it('5. FII_INCOME transaction round-trip', async () => {
    const tx = TransactionFactory.createIncome({
      portfolioId,
      accountId,
      assetId,
      type: 'FII_INCOME',
      amount: '95.00',
      currency: 'BRL',
      tradeDate: '2026-03-05',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'FII_INCOME').toBe(true);
    if (r && r.type === 'FII_INCOME') {
      expect(r.amount.amount).toBe('95');
    }
  });

  it('6. SPLIT transaction round-trip', async () => {
    const tx = TransactionFactory.createSplit({
      portfolioId,
      accountId,
      assetId,
      type: 'SPLIT',
      factor: '2',
      currency: 'BRL',
      tradeDate: '2026-03-06',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'SPLIT').toBe(true);
    if (r && r.type === 'SPLIT') {
      expect(r.factor.value).toBe('2');
    }
  });

  it('7. REVERSE_SPLIT transaction round-trip', async () => {
    const tx = TransactionFactory.createSplit({
      portfolioId,
      accountId,
      assetId,
      type: 'REVERSE_SPLIT',
      factor: '0.1',
      currency: 'BRL',
      tradeDate: '2026-03-07',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'REVERSE_SPLIT').toBe(true);
    if (r && r.type === 'REVERSE_SPLIT') {
      expect(r.factor.value).toBe('0.1');
    }
  });

  it('8. BONUS transaction round-trip', async () => {
    const tx = TransactionFactory.createBonus({
      portfolioId,
      accountId,
      assetId,
      quantity: '10',
      currency: 'BRL',
      tradeDate: '2026-03-08',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'BONUS').toBe(true);
    if (r && r.type === 'BONUS') {
      expect(r.quantity.value).toBe('10');
    }
  });

  it('9. SUBSCRIPTION transaction round-trip', async () => {
    const tx = TransactionFactory.createSubscription({
      portfolioId,
      accountId,
      assetId,
      quantity: '25',
      unitPrice: '50.00',
      currency: 'BRL',
      tradeDate: '2026-03-09',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'SUBSCRIPTION').toBe(true);
    if (r && r.type === 'SUBSCRIPTION') {
      expect(r.quantity.value).toBe('25');
      expect(r.unitPrice.amount).toBe('50');
    }
  });

  it('10. AMORTIZATION transaction round-trip', async () => {
    const tx = TransactionFactory.createAmortization({
      portfolioId,
      accountId,
      assetId,
      amount: '12.50',
      currency: 'BRL',
      tradeDate: '2026-03-10',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'AMORTIZATION').toBe(true);
    if (r && r.type === 'AMORTIZATION') {
      expect(r.amount.amount).toBe('12.5');
    }
  });

  it('11. TRANSFER_IN transaction round-trip with transferGroupId', async () => {
    const tx = TransactionFactory.createTransfer({
      portfolioId,
      accountId,
      assetId,
      type: 'TRANSFER_IN',
      quantity: '30',
      transferGroupId: 'tg-roundtrip-123',
      currency: 'BRL',
      tradeDate: '2026-03-11',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'TRANSFER_IN').toBe(true);
    if (r && r.type === 'TRANSFER_IN') {
      expect(r.quantity.value).toBe('30');
      expect(r.transferGroupId).toBe('tg-roundtrip-123');
    }
  });

  it('12. TRANSFER_OUT transaction round-trip with transferGroupId', async () => {
    const tx = TransactionFactory.createTransfer({
      portfolioId,
      accountId,
      assetId,
      type: 'TRANSFER_OUT',
      quantity: '30',
      transferGroupId: 'tg-roundtrip-123',
      currency: 'BRL',
      tradeDate: '2026-03-12',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'TRANSFER_OUT').toBe(true);
    if (r && r.type === 'TRANSFER_OUT') {
      expect(r.quantity.value).toBe('30');
      expect(r.transferGroupId).toBe('tg-roundtrip-123');
    }
  });

  it('12b. RECEIPT_CONVERSION round-trip preserves dual-asset decimals exactly', async () => {
    const target = await assetRepo.create(
      Asset.create({
        ticker: 'SNEL11',
        name: 'Suno Energias Limpas',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );
    const tx = TransactionFactory.createReceiptConversion({
      portfolioId,
      accountId,
      assetId,
      targetAssetId: target.id,
      quantity: '200',
      targetQuantity: '200',
      conversionRatio: '1',
      conversionType: 'SUBSCRIPTION_RECEIPT',
      currency: 'BRL',
      tradeDate: '2026-03-12',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'RECEIPT_CONVERSION').toBe(true);
    if (r && r.type === 'RECEIPT_CONVERSION') {
      expect(String(r.assetId)).toBe(String(assetId));
      expect(String(r.targetAssetId)).toBe(String(target.id));
      expect(r.quantity.value).toBe('200');
      expect(r.targetQuantity.value).toBe('200');
      expect(r.conversionRatio.value).toBe('1');
      expect(r.conversionType).toBe('SUBSCRIPTION_RECEIPT');
    }
  });

  it('12c. DB CHECK rejects conversion scope violations at the storage layer', async () => {
    const target = await assetRepo.create(
      Asset.create({
        ticker: 'SNEL13',
        name: 'Suno Recibo',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );
    // BUY carrying conversion columns must be rejected by the CHECK constraint.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO transactions (id, portfolio_id, account_id, asset_id, type, trade_date, currency, quantity, target_asset_id) VALUES (gen_random_uuid(), $1, $2, $3, 'BUY', '2026-03-12', 'BRL', 1, $4)`,
        portfolioId,
        accountId,
        assetId,
        target.id,
      ),
    ).rejects.toThrow();
    // RECEIPT_CONVERSION without target columns must be rejected as well.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO transactions (id, portfolio_id, account_id, asset_id, type, trade_date, currency, quantity) VALUES (gen_random_uuid(), $1, $2, $3, 'RECEIPT_CONVERSION', '2026-03-12', 'BRL', 1)`,
        portfolioId,
        accountId,
        assetId,
      ),
    ).rejects.toThrow();
  });

  it('13. DEPOSIT transaction round-trip', async () => {
    const tx = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '15000.00',
      currency: 'BRL',
      tradeDate: '2026-03-13',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'DEPOSIT').toBe(true);
    if (r && r.type === 'DEPOSIT') {
      expect(r.amount.amount).toBe('15000');
    }
  });

  it('14. WITHDRAWAL transaction round-trip', async () => {
    const tx = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'WITHDRAWAL',
      amount: '2000.00',
      currency: 'BRL',
      tradeDate: '2026-03-14',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'WITHDRAWAL').toBe(true);
    if (r && r.type === 'WITHDRAWAL') {
      expect(r.amount.amount).toBe('2000');
    }
  });

  it('15. FEE transaction round-trip', async () => {
    const tx = TransactionFactory.createExpense({
      portfolioId,
      accountId,
      type: 'FEE',
      amount: '15.90',
      currency: 'BRL',
      tradeDate: '2026-03-15',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'FEE').toBe(true);
    if (r && r.type === 'FEE') {
      expect(r.amount.amount).toBe('15.9');
    }
  });

  it('16. TAX transaction round-trip', async () => {
    const tx = TransactionFactory.createExpense({
      portfolioId,
      accountId,
      type: 'TAX',
      amount: '45.00',
      currency: 'BRL',
      assetId,
      tradeDate: '2026-03-16',
    });
    await txRepo.create(tx);
    const r = await txRepo.findById(tx.id);
    expect(r && r.type === 'TAX').toBe(true);
    if (r && r.type === 'TAX') {
      expect(r.amount.amount).toBe('45');
      expect(r.assetId).toBe(assetId);
    }
  });
});
