import { describe, it, expect, vi } from 'vitest';
import { LocalDate } from '@atlas/domain';
import { IMarketQuoteRepository, MarketQuoteRecordRow } from '@atlas/database';
import { MarketDataAssetRef } from '@atlas/market-data';
import { PersistedHistoricalMarketDataProvider } from '../../apps/api/src/market-data/persisted-historical-market-data.provider';

describe('PersistedHistoricalMarketDataProvider (Phase 5A-I4)', () => {
  const assetRef: MarketDataAssetRef = {
    assetId: 'asset-1' as never,
    ticker: 'PETR4',
    exchange: 'B3',
    currency: 'BRL' as never,
    assetType: 'STOCK' as never,
  };

  it('retrieves EXACT price when quote matches requested date', async () => {
    const mockQuote: MarketQuoteRecordRow = {
      id: 'quote-1',
      assetId: 'asset-1',
      tradingDate: LocalDate.from('2026-10-16'),
      currency: 'BRL',
      open: '58.00',
      high: '59.50',
      low: '57.80',
      close: '59.25',
      adjustedClose: null,
      volume: '1000000',
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
      firstFetchedAt: new Date(),
      lastFetchedAt: new Date(),
      fetchCount: 1,
      revisedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockQuoteRepo: Partial<IMarketQuoteRepository> = {
      findByAssetDate: vi.fn().mockResolvedValue(mockQuote),
      findRange: vi.fn().mockResolvedValue([mockQuote]),
    };
    const mockAssetRepo: Partial<IAssetRepository> = {};

    const provider = new PersistedHistoricalMarketDataProvider(
      mockQuoteRepo as IMarketQuoteRepository,
      mockAssetRepo as IAssetRepository,
    );

    const price = await provider.getDailyPrice(assetRef, LocalDate.from('2026-10-16'));

    expect(price.status).toBe('EXACT');
    expect(price.close.amount).toBe('59.25');
    expect(price.currency).toBe('BRL');
    expect(price.source).toBe('BRAPI');
    expect(mockQuoteRepo.findByAssetDate).toHaveBeenCalledWith(
      'asset-1',
      LocalDate.from('2026-10-16'),
    );
  });

  it('resolves PREVIOUS_TRADING_DAY when exact date quote is absent but previous weekday quote exists within lookback', async () => {
    const mockFridayQuote: MarketQuoteRecordRow = {
      id: 'quote-friday',
      assetId: 'asset-1',
      tradingDate: LocalDate.from('2026-10-16'), // Friday
      currency: 'BRL',
      open: null,
      high: null,
      low: null,
      close: '59.25',
      adjustedClose: null,
      volume: null,
      provider: 'BRAPI',
      providerSymbol: 'PETR4',
      firstFetchedAt: new Date(),
      lastFetchedAt: new Date(),
      fetchCount: 1,
      revisedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockQuoteRepo: Partial<IMarketQuoteRepository> = {
      findByAssetDate: vi.fn().mockResolvedValue(null), // Saturday has no quote
      findRange: vi.fn().mockResolvedValue([mockFridayQuote]),
    };
    const mockAssetRepo: Partial<IAssetRepository> = {};

    const provider = new PersistedHistoricalMarketDataProvider(
      mockQuoteRepo as IMarketQuoteRepository,
      mockAssetRepo as IAssetRepository,
    );

    // Request for Saturday 2026-10-17
    const price = await provider.getDailyPrice(assetRef, LocalDate.from('2026-10-17'));

    expect(price.status).toBe('PREVIOUS_TRADING_DAY');
    expect(price.date.toString()).toBe('2026-10-16');
    expect(price.close.amount).toBe('59.25');
  });

  it('returns UNAVAILABLE without network calls when no quote exists within lookback', async () => {
    const mockQuoteRepo: Partial<IMarketQuoteRepository> = {
      findByAssetDate: vi.fn().mockResolvedValue(null),
      findRange: vi.fn().mockResolvedValue([]),
    };
    const mockAssetRepo: Partial<IAssetRepository> = {};

    const provider = new PersistedHistoricalMarketDataProvider(
      mockQuoteRepo as IMarketQuoteRepository,
      mockAssetRepo as IAssetRepository,
    );

    const price = await provider.getDailyPrice(assetRef, LocalDate.from('2026-10-16'));

    expect(price.status).toBe('UNAVAILABLE');
    expect(price.close.amount).toBe('0.01');
  });
});
