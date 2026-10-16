import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';
import { PrismaMarketQuoteRepository } from '../../packages/database/src/repositories/market-quote.repository';
import { LocalDate } from '@atlas/domain';

describe('Database Integration: PrismaMarketQuoteRepository', () => {
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

    // Create test asset
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

  it('handles CASE A: Fresh quote insertion with accurate string decimals and dates', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    const result = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '38.45',
      open: '37.90',
      high: '38.70',
      low: '37.80',
      volume: '12500000',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });

    expect(result.outcome).toBe('INSERTED');
    expect(result.revision).toBeUndefined();
    expect(result.quote.assetId).toBe(assetId);
    expect(result.quote.tradingDate.toString()).toBe('2026-10-15');
    expect(result.quote.close).toBe('38.45');
    expect(result.quote.open).toBe('37.9');
    expect(result.quote.high).toBe('38.7');
    expect(result.quote.low).toBe('37.8');
    expect(result.quote.fetchCount).toBe(1);
    expect(result.quote.revisedAt).toBeNull();
  });

  it('handles CASE B: Identical refetch without adding revision rows (idempotent)', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    const first = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '38.45',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    expect(first.outcome).toBe('INSERTED');
    expect(first.quote.fetchCount).toBe(1);

    // Identical refetch
    const second = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '38.45',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });

    expect(second.outcome).toBe('UNCHANGED');
    expect(second.revision).toBeUndefined();
    expect(second.quote.fetchCount).toBe(2);

    const revisions = await repo.listRevisions(second.quote.id);
    expect(revisions).toHaveLength(0);
  });

  it('handles CASE C: Quote revision detected, stores audit trail row in market_quote_revisions', async () => {
    const tradingDate = LocalDate.from('2026-10-15');

    // Initial quote
    const initial = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '38.45',
      open: '37.90',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    expect(initial.outcome).toBe('INSERTED');

    // Provider publishes revised close price
    const revised = await repo.upsertQuote({
      assetId,
      tradingDate,
      currency: 'BRL',
      close: '38.50',
      open: '37.90',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
      reason: 'Exchange corrected auction closing price',
    });

    expect(revised.outcome).toBe('REVISED');
    expect(revised.quote.close).toBe('38.5');
    expect(revised.quote.fetchCount).toBe(2);
    expect(revised.quote.revisedAt).toBeInstanceOf(Date);
    expect(revised.revision).toBeDefined();
    expect(revised.revision?.priorClose).toBe('38.45');
    expect(revised.revision?.newClose).toBe('38.5');
    expect(revised.revision?.reason).toBe('Exchange corrected auction closing price');

    // Audit list check
    const revisions = await repo.listRevisions(revised.quote.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.priorClose).toBe('38.45');
    expect(revisions[0]?.newClose).toBe('38.5');
  });

  it('queries quotes correctly with findLatest, findLatestByAssets, and findRange', async () => {
    await repo.upsertQuote({
      assetId,
      tradingDate: LocalDate.from('2026-10-13'),
      currency: 'BRL',
      close: '37.50',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    await repo.upsertQuote({
      assetId,
      tradingDate: LocalDate.from('2026-10-14'),
      currency: 'BRL',
      close: '38.00',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });
    await repo.upsertQuote({
      assetId,
      tradingDate: LocalDate.from('2026-10-15'),
      currency: 'BRL',
      close: '38.50',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
    });

    // 1. findLatest
    const latest = await repo.findLatest(assetId);
    expect(latest).not.toBeNull();
    expect(latest?.tradingDate.toString()).toBe('2026-10-15');
    expect(latest?.close).toBe('38.5');

    // 2. findLatestByAssets
    const map = await repo.findLatestByAssets([assetId]);
    expect(map.get(assetId)?.close).toBe('38.5');

    // 3. findRange
    const range = await repo.findRange(
      assetId,
      LocalDate.from('2026-10-13'),
      LocalDate.from('2026-10-14'),
    );
    expect(range).toHaveLength(2);
    expect(range[0]?.tradingDate.toString()).toBe('2026-10-13');
    expect(range[1]?.tradingDate.toString()).toBe('2026-10-14');
  });
});
