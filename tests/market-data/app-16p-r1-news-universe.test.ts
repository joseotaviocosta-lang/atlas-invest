import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PortfolioOpportunityRadarController,
} from '../../apps/api/src/modules/portfolios/portfolio-opportunity-radar.controller';
import { GetOpportunityRadarUseCase } from '../../apps/api/src/application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { OpportunityRadarCacheService } from '../../apps/api/src/application/portfolios/opportunity-radar/opportunity-radar-cache.service';
import {
  resolvePortfolioNewsUniverseFromLedger,
  resolvePortfolioNewsUniverseFromPositions,
} from '../../apps/api/src/application/portfolios/opportunity-radar/resolve-portfolio-news-tickers';
import {
  Asset,
  TransactionFactory,
  type Transaction,
} from '@atlas/domain';
import { OPPORTUNITY_MODEL_VERSION } from '@atlas/market-data';

function deterministicUuid(prefixHex: string, index: number): string {
  const tail = String(index).padStart(12, '0');
  return `${prefixHex}-0000-4000-8000-${tail}`;
}

function buildBuyTx(params: {
  id: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  quantity: string;
  unitPrice: string;
  tradeDate: string;
}): Transaction {
  return TransactionFactory.createBuy({
    id: params.id,
    portfolioId: params.portfolioId,
    accountId: params.accountId,
    assetId: params.assetId,
    tradeDate: params.tradeDate,
    quantity: params.quantity,
    unitPrice: params.unitPrice,
    currency: 'BRL',
    source: 'MANUAL',
  });
}

function buildSellTx(params: {
  id: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  quantity: string;
  unitPrice: string;
  tradeDate: string;
}): Transaction {
  return TransactionFactory.createSell({
    id: params.id,
    portfolioId: params.portfolioId,
    accountId: params.accountId,
    assetId: params.assetId,
    tradeDate: params.tradeDate,
    quantity: params.quantity,
    unitPrice: params.unitPrice,
    currency: 'BRL',
    source: 'MANUAL',
  });
}

const REALISTIC_36_ASSETS: Array<{ id: string; ticker: string; name: string; type: 'STOCK' | 'FII' }> = [
  ...Array.from({ length: 24 }, (_, idx) => ({
    id: deterministicUuid('10000000', idx + 1),
    ticker: `STK${String(idx + 1).padStart(2, '0')}4`,
    name: `Ação Exemplo ${idx + 1}`,
    type: 'STOCK' as const,
  })),
  ...Array.from({ length: 12 }, (_, idx) => ({
    id: deterministicUuid('20000000', idx + 1),
    ticker: `FII${String(idx + 1).padStart(2, '0')}11`,
    name: `Fundo Imobiliário ${idx + 1}`,
    type: 'FII' as const,
  })),
];

function makeAssetDomain(def: { id: string; ticker: string; name: string; type: 'STOCK' | 'FII' }): Asset {
  return Asset.create({
    id: def.id,
    ticker: def.ticker,
    name: def.name,
    type: def.type,
    currency: 'BRL',
    exchange: 'B3',
  });
}

function buildMockNewsPipelineService() {
  return {
    getPortfolioNews: vi.fn().mockImplementation(async ({ tickers }: { tickers: string[] }) => {
      const uniqueTickers = Array.from(new Set(tickers.map((t) => t.toUpperCase().trim()))).filter(Boolean);
      const assetDailyStatus = Object.fromEntries(
        uniqueTickers.map((t) => [t, 'NO_RECENT_NEWS']),
      );
      return {
        events: [],
        totalEvents: 0,
        byAssetCount: Object.fromEntries(uniqueTickers.map((t) => [t, 0])),
        digest: {
          date: '2026-11-11',
          totalEvents: 0,
          materialEventsCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          routineCount: 0,
          affectedAssetsCount: 0,
          affectedAssets: [],
          items: [],
        },
        assetDailyStatus,
        metrics: {
          breakingCount: 0,
          recentCount: 0,
          officialCount: 0,
          highImportanceCount: 0,
          materialCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          routineCount: 0,
          totalAuditedAssets: uniqueTickers.length,
          assetsWithNews: 0,
          assetsWithoutNews: uniqueTickers.length,
          officialCoverageCount: 0,
          providerStatus: {
            brapiNewsAvailable: false,
            brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
            officialStatus: 'NO_OFFICIAL_EVENTS',
            cvmStatus: 'NOT_APPLICABLE',
            fnetStatus: 'NOT_APPLICABLE',
            fallbackActive: uniqueTickers.length > 0,
            providersUsed: uniqueTickers.length > 0 ? ['Google News RSS (Agregador)'] : [],
          },
        },
        asOf: '2026-11-11T22:00:00.000Z',
      };
    }),
  };
}

describe('APP-16P-R1: Portfolio News Universe Independence from Valuation & Quotes', () => {
  const portfolioId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000001';
  const acc1 = 'aaaaaaaa-0000-4000-8000-000000000001';
  const acc2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  const principal = { userId, sessionId: 'sess-1' } as never;

  let mockPortfolioRepo: { findById: ReturnType<typeof vi.fn> };
  let mockAssetRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByIds: ReturnType<typeof vi.fn>;
  };
  let mockTransactionRepo: { findByPortfolioId: ReturnType<typeof vi.fn> };
  let mockIntelligenceRepo: { list: ReturnType<typeof vi.fn> };
  let mockValuationUseCase: { execute: ReturnType<typeof vi.fn> };
  let mockStrategyUseCase: { getStrategy: ReturnType<typeof vi.fn> };
  let mockConfigService: { getStatus: ReturnType<typeof vi.fn>; getToken: ReturnType<typeof vi.fn> };
  let mockNewsPipelineService: ReturnType<typeof buildMockNewsPipelineService>;

  beforeEach(() => {
    const assetDomainMap = new Map(REALISTIC_36_ASSETS.map((a) => [a.id, makeAssetDomain(a)]));

    mockPortfolioRepo = {
      findById: vi.fn().mockResolvedValue({
        id: portfolioId,
        userId,
        name: 'Carteira Principal',
      }),
    };

    mockAssetRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => assetDomainMap.get(id) ?? null),
      findByIds: vi.fn().mockImplementation(async (ids: readonly string[]) =>
        ids.map((id) => assetDomainMap.get(id)).filter((a): a is Asset => Boolean(a)),
      ),
    };

    const txs = REALISTIC_36_ASSETS.map((a, idx) =>
      buildBuyTx({
        id: deterministicUuid('30000000', idx + 1),
        portfolioId,
        accountId: acc1,
        assetId: a.id,
        quantity: '10',
        unitPrice: '25.00',
        tradeDate: '2026-10-01',
      }),
    );

    mockTransactionRepo = {
      findByPortfolioId: vi.fn().mockResolvedValue(txs),
    };

    mockIntelligenceRepo = {
      list: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    };

    // Simulate ALL 36 positions QUOTE_STALE in valuation!
    mockValuationUseCase = {
      execute: vi.fn().mockResolvedValue({
        portfolioId,
        positions: REALISTIC_36_ASSETS.map((a) => ({
          assetId: a.id,
          ticker: a.ticker,
          assetType: a.type,
          quantity: '10',
          currency: 'BRL',
          status: 'QUOTE_STALE',
          marketValue: null,
          quoteFreshness: 'STALE',
        })),
      }),
    };

    mockStrategyUseCase = {
      getStrategy: vi.fn().mockResolvedValue({ portfolioId, targets: [] }),
    };

    mockConfigService = {
      getStatus: vi.fn().mockReturnValue({ provider: 'BRAPI', authenticated: false }),
      getToken: vi.fn().mockReturnValue(undefined),
    };

    mockNewsPipelineService = buildMockNewsPipelineService();
  });

  it('PARTE V / W / AE: audits all 36 holdings without calling valuation even when all 36 quotes are QUOTE_STALE or absent', async () => {
    const useCase = new GetOpportunityRadarUseCase(
      mockPortfolioRepo as never,
      mockAssetRepo as never,
      mockIntelligenceRepo as never,
      mockValuationUseCase as never,
      mockStrategyUseCase as never,
      new OpportunityRadarCacheService(),
      mockConfigService as never,
      mockNewsPipelineService as never,
      undefined,
      mockTransactionRepo as never,
    );

    const controller = new PortfolioOpportunityRadarController(useCase);
    const res = await controller.refreshPortfolioNews(portfolioId, principal);

    expect(mockValuationUseCase.execute).not.toHaveBeenCalled();
    expect(mockNewsPipelineService.getPortfolioNews).toHaveBeenCalledTimes(1);
    const calledTickers = mockNewsPipelineService.getPortfolioNews.mock.calls[0]?.[0]?.tickers as string[];
    expect(calledTickers).toHaveLength(36);
    expect(res.data.metrics.totalAuditedAssets).toBe(36);
    expect(Object.keys(res.data.assetDailyStatus ?? {})).toHaveLength(36);
    // Verify FIIs are preserved (PARTE AB)
    expect(calledTickers).toContain('FII0111');
    expect(calledTickers).toContain('FII1211');
    expect(calledTickers).toContain('STK014');
  });

  it('PARTE X: mixed quotes (20 VALUED + 16 QUOTE_STALE) and quote freshness changes produce identical 36-asset news universe', async () => {
    const useCase = new GetOpportunityRadarUseCase(
      mockPortfolioRepo as never,
      mockAssetRepo as never,
      mockIntelligenceRepo as never,
      mockValuationUseCase as never,
      mockStrategyUseCase as never,
      new OpportunityRadarCacheService(),
      mockConfigService as never,
      mockNewsPipelineService as never,
      undefined,
      mockTransactionRepo as never,
    );

    const universeStale = await useCase.resolvePortfolioNewsTickers({ portfolioId, userId });

    // Flip 20 positions to VALUED with fresh quotes and keep 16 QUOTE_STALE
    mockValuationUseCase.execute.mockResolvedValue({
      portfolioId,
      positions: REALISTIC_36_ASSETS.map((a, idx) => ({
        assetId: a.id,
        ticker: a.ticker,
        assetType: a.type,
        quantity: '10',
        currency: 'BRL',
        status: idx < 20 ? 'VALUED' : 'QUOTE_STALE',
        marketValue: idx < 20 ? { amount: '500.00', currency: 'BRL' } : null,
      })),
    });

    const universeMixed = await useCase.resolvePortfolioNewsTickers({ portfolioId, userId });

    expect(universeStale.source).toBe('LEDGER_POSITIONS');
    expect(universeMixed.source).toBe('LEDGER_POSITIONS');
    expect(universeStale.tickers).toHaveLength(36);
    expect(universeMixed.tickers).toEqual(universeStale.tickers);
    expect(mockValuationUseCase.execute).not.toHaveBeenCalled();
  });

  it('PARTE Y / Z / AA / G: excludes closed zero positions, deduplicates multi-account tickers, returns 0 for empty portfolio, ignores blank tickers', async () => {
    const petr4Id = deterministicUuid('40000000', 1);
    const hglg11Id = deterministicUuid('40000000', 2);
    const vale3Id = deterministicUuid('40000000', 3);
    const noTickerId = deterministicUuid('40000000', 4);

    const petr4 = makeAssetDomain({ id: petr4Id, ticker: 'PETR4', name: 'Petrobras', type: 'STOCK' });
    const hglg11 = makeAssetDomain({ id: hglg11Id, ticker: 'HGLG11', name: 'CSHG Logística', type: 'FII' });
    const closedAsset = makeAssetDomain({ id: vale3Id, ticker: 'VALE3', name: 'Vale', type: 'STOCK' });
    const noTickerAsset = { id: noTickerId, ticker: '   ' } as unknown as Asset;

    const assetMap = new Map<string, Asset>([
      [petr4Id, petr4],
      [hglg11Id, hglg11],
      [vale3Id, closedAsset],
      [noTickerId, noTickerAsset],
    ]);

    const txs = [
      // PETR4 bought across two separate accounts -> monitored once
      buildBuyTx({
        id: deterministicUuid('50000000', 1),
        portfolioId,
        accountId: acc1,
        assetId: petr4Id,
        quantity: '10',
        unitPrice: '30.00',
        tradeDate: '2026-10-01',
      }),
      buildBuyTx({
        id: deterministicUuid('50000000', 2),
        portfolioId,
        accountId: acc2,
        assetId: petr4Id,
        quantity: '15',
        unitPrice: '31.00',
        tradeDate: '2026-10-02',
      }),
      // HGLG11 FII open position
      buildBuyTx({
        id: deterministicUuid('50000000', 3),
        portfolioId,
        accountId: acc1,
        assetId: hglg11Id,
        quantity: '5',
        unitPrice: '155.00',
        tradeDate: '2026-10-03',
      }),
      // VALE3 bought and completely sold -> closed (zero position), excluded
      buildBuyTx({
        id: deterministicUuid('50000000', 4),
        portfolioId,
        accountId: acc1,
        assetId: vale3Id,
        quantity: '20',
        unitPrice: '60.00',
        tradeDate: '2026-10-01',
      }),
      buildSellTx({
        id: deterministicUuid('50000000', 5),
        portfolioId,
        accountId: acc1,
        assetId: vale3Id,
        quantity: '20',
        unitPrice: '62.00',
        tradeDate: '2026-10-05',
      }),
      // Asset without valid ticker -> ignored safely
      buildBuyTx({
        id: deterministicUuid('50000000', 6),
        portfolioId,
        accountId: acc1,
        assetId: noTickerId,
        quantity: '1',
        unitPrice: '10.00',
        tradeDate: '2026-10-04',
      }),
    ];

    const res = await resolvePortfolioNewsUniverseFromLedger({
      portfolioId,
      transactionRepo: { findByPortfolioId: vi.fn().mockResolvedValue(txs) },
      assetRepo: {
        findById: vi.fn().mockImplementation(async (id: string) => assetMap.get(id) ?? null),
        findByIds: vi.fn().mockImplementation(async (ids: readonly string[]) =>
          ids.map((id) => assetMap.get(id)).filter((a): a is Asset => Boolean(a)),
        ),
      },
    });

    expect(res.tickers).toEqual(['PETR4', 'HGLG11']);
    expect(res.ignoredWithoutTickerCount).toBe(1);
    expect(res.tickers).not.toContain('VALE3');

    // Empty portfolio -> 0 honest holdings, zero invented tickers
    const emptyRes = await resolvePortfolioNewsUniverseFromLedger({
      portfolioId,
      transactionRepo: { findByPortfolioId: vi.fn().mockResolvedValue([]) },
      assetRepo: { findById: vi.fn() },
    });
    expect(emptyRes.tickers).toEqual([]);
    expect(emptyRes.activeHoldingsCount).toBe(0);
  });

  it('PARTE AF / AD: position fallback includes QUOTE_STALE & UNVALUED without marketValue, while Radar execute() remains unchanged at opportunity-v2.3.1', async () => {
    // 1. Unit fallback helper directly
    const fallback = resolvePortfolioNewsUniverseFromPositions([
      { ticker: 'PETR4', quantity: '100' },
      { ticker: 'HGLG11', quantity: '50' },
      { ticker: 'MGLU3', quantity: '0' },
      { ticker: 'PETR4', quantity: '25' },
      { ticker: null, quantity: '10' },
    ]);
    expect(fallback.tickers).toEqual(['PETR4', 'HGLG11']);
    expect(fallback.ignoredWithoutTickerCount).toBe(1);

    // 2. Legacy GetOpportunityRadarUseCase without transactionRepo uses fallback (no VALUED/marketValue filter)
    const legacyFallbackUseCase = new GetOpportunityRadarUseCase(
      mockPortfolioRepo as never,
      mockAssetRepo as never,
      mockIntelligenceRepo as never,
      mockValuationUseCase as never,
      mockStrategyUseCase as never,
      new OpportunityRadarCacheService(),
      mockConfigService as never,
      mockNewsPipelineService as never,
    );

    const newsRes = await legacyFallbackUseCase.getPortfolioNews({ portfolioId, userId });
    expect(newsRes.metrics.totalAuditedAssets).toBe(36);

    // 3. Meanwhile Opportunity Radar execute() still requires VALUED positions and retains opportunity-v2.3.1
    const radarRes = await legacyFallbackUseCase.execute({ portfolioId, userId, forceRefresh: true });
    expect(radarRes.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');
    expect(radarRes.items).toEqual([]);
  });
});
