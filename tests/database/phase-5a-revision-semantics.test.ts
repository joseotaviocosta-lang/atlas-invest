import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';
import { PrismaMarketQuoteRepository } from '../../packages/database/src/repositories/market-quote.repository';
import { LocalDate } from '@atlas/domain';
import { toCanonicalDecimalString } from '@atlas/market-data';
import { Prisma } from '@prisma/client';

describe('Database Integration: Phase 5A Revision Semantics & Atomicity (Sections 10–14)', () => {
  const prisma = getTestPrismaClient();
  const repo = new PrismaMarketQuoteRepository(prisma);

  let assetId: string;

  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    const asset = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    assetId = asset.id;
  });

  it('Section 10: Revision Semantics — Case A (Fresh Insert)', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    const result = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.36',
      open: '56.80',
      high: '57.50',
      low: '56.50',
      volume: '15000000',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });

    expect(result.outcome).toBe('INSERTED');
    expect(result.revision).toBeUndefined();
    expect(result.quote.assetId).toBe(assetId);
    expect(result.quote.close).toBe('57.36');
    expect(result.quote.fetchCount).toBe(1);
    expect(result.quote.firstFetchedAt).toBeInstanceOf(Date);
    expect(result.quote.lastFetchedAt).toBeInstanceOf(Date);
    expect(result.quote.revisedAt).toBeNull();

    const revisions = await repo.listRevisions(result.quote.id);
    expect(revisions).toHaveLength(0);
  });

  it('Section 11: Revision Semantics — Case B (Identical Refetch)', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    const first = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.36',
      open: '56.80',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    const firstFetchedAt = first.quote.firstFetchedAt;

    // Small delay to ensure timestamp progression
    await new Promise((r) => setTimeout(r, 20));

    const second = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.36',
      open: '56.80',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });

    expect(second.outcome).toBe('UNCHANGED');
    expect(second.revision).toBeUndefined();
    expect(second.quote.close).toBe('57.36');
    expect(second.quote.fetchCount).toBe(2);
    expect(second.quote.firstFetchedAt.getTime()).toBe(firstFetchedAt.getTime());
    expect(second.quote.lastFetchedAt.getTime()).toBeGreaterThanOrEqual(firstFetchedAt.getTime());
    expect(second.quote.revisedAt).toBeNull();

    const revisions = await repo.listRevisions(second.quote.id);
    expect(revisions).toHaveLength(0);
  });

  it('Section 12: Revision Semantics — Case C (Revised OHLC / Volume)', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    const first = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.36',
      volume: '15000000',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });

    const revised = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.42',
      volume: '15200000',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
      reason: 'Exchange published post-market adjusted auction close',
    });

    expect(revised.outcome).toBe('REVISED');
    expect(revised.quote.close).toBe('57.42');
    expect(revised.quote.volume).toBe('15200000');
    expect(revised.quote.fetchCount).toBe(2);
    expect(revised.quote.revisedAt).toBeInstanceOf(Date);
    expect(revised.quote.firstFetchedAt.getTime()).toBe(first.quote.firstFetchedAt.getTime());

    expect(revised.revision).toBeDefined();
    expect(revised.revision?.priorClose).toBe('57.36');
    expect(revised.revision?.newClose).toBe('57.42');
    expect(revised.revision?.priorVolume).toBe('15000000');
    expect(revised.revision?.newVolume).toBe('15200000');
    expect(revised.revision?.reason).toBe('Exchange published post-market adjusted auction close');

    const allRevisions = await repo.listRevisions(revised.quote.id);
    expect(allRevisions).toHaveLength(1);
  });

  it('Section 13: Revision Atomicity (All-or-Nothing Transactional Boundary)', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    // Seed initial quote
    const initial = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.36',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    expect(initial.outcome).toBe('INSERTED');

    // Simulate an aborted transaction where revision insert succeeds but subsequent update crashes
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.marketQuoteRevisionRecord.create({
          data: {
            marketQuoteId: initial.quote.id,
            priorClose: new Prisma.Decimal('57.36'),
            newClose: new Prisma.Decimal('99.99'),
            reason: 'Doomed transaction test',
          },
        });

        // Intentional failure before quote update commits
        throw new Error('Simulated crash during atomic revision');
      }),
    ).rejects.toThrow('Simulated crash during atomic revision');

    // Verify atomicity: 0 revision rows exist, and quote is unchanged
    const revisionsAfterCrash = await repo.listRevisions(initial.quote.id);
    expect(revisionsAfterCrash).toHaveLength(0);

    const quoteAfterCrash = await repo.findLatest(assetId);
    expect(quoteAfterCrash?.close).toBe('57.36');
    expect(quoteAfterCrash?.revisedAt).toBeNull();
  });

  it('Section 14: Decimal Equality Regression (57.36 vs 57.360 & IEEE Noise)', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    // Initial quote with standard 2 decimal places
    const initial = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.36',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    expect(initial.outcome).toBe('INSERTED');

    // Refetch with trailing zero '57.360' -> must be recognized as numerically equal, NOT revised
    const trailingZeroRefetch = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '57.360',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    expect(trailingZeroRefetch.outcome).toBe('UNCHANGED');

    // Test IEEE 754 float representation (0.1 + 0.2 = 0.30000000000000004)
    // toCanonicalDecimalString formats it to exact canonical string '0.3'
    const ieeeStr = toCanonicalDecimalString(0.1 + 0.2);
    expect(ieeeStr).toBe('0.3');

    const exactThree = toCanonicalDecimalString('0.3');
    expect(new Prisma.Decimal(ieeeStr!).equals(new Prisma.Decimal(exactThree!))).toBe(true);

    const revisions = await repo.listRevisions(initial.quote.id);
    expect(revisions).toHaveLength(0);
  });
});
