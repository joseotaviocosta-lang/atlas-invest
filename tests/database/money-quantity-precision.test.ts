import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Money, Quantity, TransactionFactory } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from './setup';
import { TransactionRepository, AssetRepository } from '../../packages/database/src';
import { Asset } from '@atlas/domain';

describe('Database Integration: Money & Quantity Precision Round-Trip', () => {
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);
  const assetRepo = new AssetRepository(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('should store and retrieve extreme decimal precision without float distortion', async () => {
    const { portfolioId, accountId } = await seedBaseFixtures();

    const asset = await assetRepo.create(
      Asset.create({
        ticker: 'PREC4',
        name: 'Precision Test Asset',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );

    const extremeQuantity = '123456789.123456789';
    const extremeUnitPrice = '987654321.987654321';
    const microFee = '0.00000001';

    const tx = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: asset.id,
      quantity: extremeQuantity,
      unitPrice: extremeUnitPrice,
      currency: 'BRL',
      fees: microFee,
      tradeDate: '2026-06-15',
    });

    await txRepo.create(tx);

    const retrieved = await txRepo.findById(tx.id);
    expect(retrieved).not.toBeNull();
    if (retrieved && retrieved.type === 'BUY') {
      expect(retrieved.quantity.value).toBe(extremeQuantity);
      expect(retrieved.unitPrice.amount).toBe(extremeUnitPrice);
      expect(retrieved.fees?.amount).toBe(microFee);
      expect(retrieved.currency).toBe('BRL');

      // Verify that ValueObject operations on retrieved data work with precision
      const retrievedMoney = retrieved.unitPrice;
      expect(retrievedMoney.equals(Money.from(extremeUnitPrice, 'BRL'))).toBe(true);
      expect(retrieved.quantity.equals(Quantity.from(extremeQuantity))).toBe(true);
    }
  });

  it('should preserve 0.1 + 0.2 decimal accuracy when reconstituted from database', async () => {
    const { portfolioId, accountId } = await seedBaseFixtures();

    const asset = await assetRepo.create(
      Asset.create({
        ticker: 'ACCU3',
        name: 'Accuracy Asset',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );

    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: asset.id,
      quantity: '10',
      unitPrice: '0.1',
      currency: 'BRL',
      tradeDate: '2026-01-01',
    });

    const tx2 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: asset.id,
      quantity: '10',
      unitPrice: '0.2',
      currency: 'BRL',
      tradeDate: '2026-01-02',
    });

    await txRepo.create(tx1);
    await txRepo.create(tx2);

    const r1 = await txRepo.findById(tx1.id);
    const r2 = await txRepo.findById(tx2.id);

    expect(r1 && r1.type === 'BUY').toBe(true);
    expect(r2 && r2.type === 'BUY').toBe(true);

    if (r1 && r1.type === 'BUY' && r2 && r2.type === 'BUY') {
      const sum = r1.unitPrice.add(r2.unitPrice);
      expect(sum.amount).toBe('0.3');
      expect(sum.equals(Money.from('0.3', 'BRL'))).toBe(true);
    }
  });
});
