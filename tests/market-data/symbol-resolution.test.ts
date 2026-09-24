import { describe, it, expect } from 'vitest';
import { resolveMarketDataSymbol } from '@atlas/market-data';
import { createAssetId } from '@atlas/domain';

describe('MarketData: Symbol Resolution', () => {
  it('resolves B3 equity (PETR4) to correct provider symbol', () => {
    const ref = resolveMarketDataSymbol(
      {
        assetId: createAssetId(),
        ticker: 'PETR4',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK',
      },
      'STOOQ',
    );
    expect(ref.providerSymbol).toBe('PETR4.SA');
    expect(ref.assetId).toBeDefined();
  });

  it('resolves B3 FII (XPFI11) correctly', () => {
    const ref = resolveMarketDataSymbol(
      {
        assetId: createAssetId(),
        ticker: 'XPFI11',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'FII',
      },
      'STOOQ',
    );
    expect(ref.providerSymbol).toBe('XPFI11.SA');
  });

  it('resolves B3 ETF (BOVA11) correctly', () => {
    const ref = resolveMarketDataSymbol(
      {
        assetId: createAssetId(),
        ticker: 'BOVA11',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'ETF',
      },
      'STOOQ',
    );
    expect(ref.providerSymbol).toBe('BOVA11.SA');
  });

  it('resolves BDR (MELI34) correctly', () => {
    const ref = resolveMarketDataSymbol(
      {
        assetId: createAssetId(),
        ticker: 'MELI34',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'BDR',
      },
      'STOOQ',
    );
    expect(ref.providerSymbol).toBe('MELI34.SA');
  });

  it('resolves same ticker on different exchanges to different provider symbols', () => {
    const refB3 = resolveMarketDataSymbol(
      {
        assetId: createAssetId(),
        ticker: 'AAPL',
        exchange: 'B3',
        currency: 'USD',
        assetType: 'STOCK',
      },
      'STOOQ',
    );
    const refNYSE = resolveMarketDataSymbol(
      {
        assetId: createAssetId(),
        ticker: 'AAPL',
        exchange: 'NYSE',
        currency: 'USD',
        assetType: 'STOCK',
      },
      'STOOQ',
    );
    expect(refB3.providerSymbol).not.toBe(refNYSE.providerSymbol);
  });

  it('rejects unsupported asset type', () => {
    try {
      resolveMarketDataSymbol(
        {
          assetId: createAssetId(),
          ticker: 'UNKNOWN',
          exchange: 'UNKNOWN',
          currency: 'BRL',
          assetType: 'FIXED_INCOME',
        },
        'STOOQ',
      );
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.UNSUPPORTED_ASSET');
    }
  });
});
