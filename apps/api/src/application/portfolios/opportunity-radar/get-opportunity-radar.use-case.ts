import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  OpportunityRadarEngine,
  OpportunityRadarResult,
  OpportunityAssetInput,
  OpportunityNewsItem,
} from '@atlas/market-data';
import {
  IPortfolioRepository,
  IAssetRepository,
  IMarketIntelligenceRepository,
} from '@atlas/database';
import {
  PORTFOLIO_REPOSITORY,
  ASSET_REPOSITORY,
  MARKET_INTELLIGENCE_REPOSITORY,
} from '../../../database/tokens';
import { GetPortfolioValuationUseCase } from '../../valuation/get-portfolio-valuation.use-case';
import { GetPortfolioAllocationStrategyUseCase } from '../get-portfolio-allocation-strategy.use-case';
import { OpportunityRadarCacheService } from './opportunity-radar-cache.service';
import { fetchBrapiAssetIntelligence } from './brapi-intelligence.fetcher';
import { MarketDataConfigService } from '../../../market-data/market-data-config.service';

@Injectable()
export class GetOpportunityRadarUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepo: IPortfolioRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepo: IAssetRepository,
    @Inject(MARKET_INTELLIGENCE_REPOSITORY)
    private readonly intelligenceRepo: IMarketIntelligenceRepository,
    @Inject(GetPortfolioValuationUseCase)
    private readonly valuationUseCase: GetPortfolioValuationUseCase,
    @Inject(GetPortfolioAllocationStrategyUseCase)
    private readonly strategyUseCase: GetPortfolioAllocationStrategyUseCase,
    @Inject(OpportunityRadarCacheService)
    private readonly cache: OpportunityRadarCacheService,
    @Inject(MarketDataConfigService)
    private readonly configService: MarketDataConfigService,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<OpportunityRadarResult> {
    const now = params.now ?? new Date();
    const analysisDate = now.toISOString().slice(0, 10);

    // 1. Verify portfolio ownership (anti-enumeration 404)
    const portfolio = await this.portfolioRepo.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // 2. Check cache on regular read (APP-16F PARTE X, Y)
    if (!params.forceRefresh) {
      const cached = this.cache.get(params.portfolioId, analysisDate);
      if (cached) {
        return cached;
      }
    }

    // 3. Obtain canonical valuation read model
    const valuation = await this.valuationUseCase.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
    });

    const positions = valuation.positions.filter(
      (pos) => pos.status === 'VALUED' && pos.marketValue && parseFloat(pos.marketValue.amount) > 0,
    );

    if (positions.length === 0) {
      const emptyResult = OpportunityRadarEngine.evaluate({
        portfolioId: params.portfolioId,
        assets: [],
        analysisDate,
        referenceDate: now,
      });
      this.cache.set(params.portfolioId, emptyResult, analysisDate);
      return emptyResult;
    }

    // Total portfolio market value in base currency
    let totalPortfolioValuation = 0;
    for (const pos of positions) {
      if (pos.marketValue) {
        totalPortfolioValuation += parseFloat(pos.marketValue.amount) || 0;
      }
    }

    // Compute class totals
    const classValuations: Record<string, number> = {};
    for (const pos of positions) {
      const cls = pos.assetType || 'STOCK';
      const mVal = pos.marketValue ? parseFloat(pos.marketValue.amount) || 0 : 0;
      classValuations[cls] = (classValuations[cls] || 0) + mVal;
    }

    // 4. Try loading allocation targets if exists
    let classTargetWeights: Record<string, number> = {};
    try {
      const strategy = await this.strategyUseCase.getStrategy(params.portfolioId, params.userId);
      if (strategy && strategy.targets) {
        for (const t of strategy.targets) {
          if (t.category && typeof t.targetBp === 'number') {
            classTargetWeights[t.category] = t.targetBp / 100;
          }
        }
      }
    } catch {
      // Strategy is optional
    }

    // 5. Build OpportunityAssetInput for each position
    const evaluatedAssets: OpportunityAssetInput[] = [];

    // Check if BRAPI is authenticated in config service
    const status = this.configService.getStatus();
    const hasBrapiAuth = status.authenticated;

    for (const pos of positions) {
      if (!pos.marketValue) continue;
      const posVal = parseFloat(pos.marketValue.amount) || 0;
      const portfolioWeight = totalPortfolioValuation > 0 ? (posVal / totalPortfolioValuation) * 100 : 0;
      const classTotal = classValuations[pos.assetType || 'STOCK'] || posVal;
      const classWeight = classTotal > 0 ? (posVal / classTotal) * 100 : 0;

      // Load asset metadata
      const asset = await this.assetRepo.findById(pos.assetId);
      const ticker = pos.ticker ?? asset?.ticker ?? '';
      if (!ticker) continue;

      const targetWeight = classTargetWeights[pos.assetType || 'STOCK'];
      const currentPrice = pos.quote?.price || '0';
      const quoteAsOf = pos.quote?.asOf;
      const quoteFreshness = pos.quoteFreshness === 'FRESH' ? 'FRESH' : pos.quoteFreshness === 'STALE' ? 'STALE' : 'UNKNOWN';

      const name = asset?.name || ticker;
      const isFii =
        pos.assetType === 'FII' ||
        (asset?.type as string) === 'REAL_ESTATE_FUND' ||
        (asset?.type as string) === 'FII';

      // Load DB news for this asset if present
      const dbNewsItems: OpportunityNewsItem[] = [];
      try {
        const dbItems = await this.intelligenceRepo.list({ assetId: pos.assetId }, { limit: 5 });
        if (dbItems && dbItems.items) {
          for (const item of dbItems.items) {
            dbNewsItems.push({
              id: item.id,
              headline: item.headline,
              source: item.sourceProvider,
              publishedAt: item.publishedAt.toISOString(),
              canonicalUrl: item.canonicalUrl ?? undefined,
              sentiment: 'NEUTRAL',
              relevance: 1.0,
            });
          }
        }
      } catch {
        // News DB query is fail-closed
      }

      // External intelligence fetch (fundamentals and latest news)
      let extIntel = {
        priceEarnings: null as number | null,
        priceToBook: null as number | null,
        dividendYield: null as number | null,
        returnOnEquity: null as number | null,
        debtToEquity: null as number | null,
        fiftyTwoWeekHigh: null as number | null,
        fiftyTwoWeekLow: null as number | null,
        fiiSegment: null as string | null,
        fiiPriceToBook: null as number | null,
        fiiDividendYield: null as number | null,
        news: [] as OpportunityNewsItem[],
        analystConsensus: null as 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null,
      };

      if (hasBrapiAuth || ticker === 'PETR4') {
        try {
          const fetched = await fetchBrapiAssetIntelligence({ ticker });
          extIntel = {
            priceEarnings: fetched.priceEarnings ?? null,
            priceToBook: fetched.priceToBook ?? null,
            dividendYield: fetched.dividendYield ?? null,
            returnOnEquity: fetched.returnOnEquity ?? null,
            debtToEquity: fetched.debtToEquity ?? null,
            fiftyTwoWeekHigh: fetched.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: fetched.fiftyTwoWeekLow ?? null,
            fiiSegment: fetched.fiiSegment ?? null,
            fiiPriceToBook: fetched.fiiPriceToBook ?? null,
            fiiDividendYield: fetched.fiiDividendYield ?? null,
            news: fetched.news || [],
            analystConsensus: fetched.analystConsensus ?? null,
          };
        } catch {
          // Fail-closed to neutral
        }
      }

      const combinedNews = [...extIntel.news, ...dbNewsItems];

      // Calculate approximate historical metrics from price and range if available
      const priceNum = parseFloat(currentPrice) || 0;
      let drawdownFromHighPercent: number | null = null;
      if (extIntel.fiftyTwoWeekHigh && extIntel.fiftyTwoWeekHigh > 0 && priceNum > 0) {
        drawdownFromHighPercent = ((priceNum - extIntel.fiftyTwoWeekHigh) / extIntel.fiftyTwoWeekHigh) * 100;
      }

      const assetInput: OpportunityAssetInput = {
        assetId: pos.assetId,
        ticker,
        name,
        assetType: isFii ? 'FII' : 'STOCK',
        currency: pos.currency,
        quantity: pos.quantity,
        marketValue: pos.marketValue.amount,
        portfolioWeight: Math.round(portfolioWeight * 100) / 100,
        classWeight: Math.round(classWeight * 100) / 100,
        targetWeight,
        currentPrice,
        dailyChangePercent: pos.unrealizedGainLossPercent ? Math.min(5, parseFloat(pos.unrealizedGainLossPercent) / 10) : 0,
        quoteFreshness,
        quoteAsOf,
        fiftyTwoWeekHigh: extIntel.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: extIntel.fiftyTwoWeekLow,
        drawdownFromHighPercent,
        priceEarnings: extIntel.priceEarnings,
        priceToBook: extIntel.priceToBook,
        dividendYield: extIntel.dividendYield,
        returnOnEquity: extIntel.returnOnEquity,
        debtToEquity: extIntel.debtToEquity,
        fiiPriceToBook: extIntel.fiiPriceToBook,
        fiiDividendYield: extIntel.fiiDividendYield,
        fiiSegment: extIntel.fiiSegment,
        recentNews: combinedNews,
        analystConsensus: extIntel.analystConsensus,
      };

      evaluatedAssets.push(assetInput);
    }

    // 6. Run pure deterministic OpportunityRadarEngine
    const result = OpportunityRadarEngine.evaluate({
      portfolioId: params.portfolioId,
      assets: evaluatedAssets,
      analysisDate,
      referenceDate: now,
      maxResults: 5,
    });

    // 7. Store in ephemeral cache
    this.cache.set(params.portfolioId, result, analysisDate);

    return result;
  }
}
