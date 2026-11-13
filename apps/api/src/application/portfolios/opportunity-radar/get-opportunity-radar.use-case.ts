import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  OpportunityRadarEngine,
  OpportunityRadarResult,
  OpportunityAssetInput,
  OpportunityNewsItem,
  FiiDividendCalendarEvent,
  FiiCashSourceEvent,
  formatIsoDateString,
  applyPortfolioNewsState,
  selectAlertEligibleNewsEvents,
  buildDailyNewsDigest,
  buildPortfolioDailyDecisionBrief,
  buildContributionAllocationSimulation,
  buildContributionScenarioComparison,
  buildProjectedPortfolioAfterContribution,
  buildProjectedPortfolioScenarioComparison,
  deriveNewsProviderQuality,
  type PortfolioDailyDecisionBrief,
  type ContributionAllocationSimulation,
  type ContributionScenarioComparison,
  type ProjectedPortfolioAfterContribution,
  type ProjectedPortfolioScenarioComparison,
  type ProjectionBaselinePosition,
  type PortfolioNewsInboxMetrics,
  type PersistedPortfolioNewsEventState,
  type PersistedPortfolioNewsSyncState,
  type NewsEventUpdateReason,
} from '@atlas/market-data';
import {
  IPortfolioRepository,
  IAssetRepository,
  IMarketIntelligenceRepository,
  IPortfolioNewsStateRepository,
  ITransactionRepository,
  IContributionGoalRepository,
  type ListNewsAlertHistoryOutput,
  type NewsAlertDeliveryAuditItem,
  type NewsAlertHistoryStatusValue,
  type NewsAlertVersionRef,
} from '@atlas/database';
import {
  PORTFOLIO_REPOSITORY,
  ASSET_REPOSITORY,
  MARKET_INTELLIGENCE_REPOSITORY,
  PORTFOLIO_NEWS_STATE_REPOSITORY,
  TRANSACTION_REPOSITORY,
  CONTRIBUTION_GOAL_REPOSITORY,
} from '../../../database/tokens';
import { GetPortfolioValuationUseCase } from '../../valuation/get-portfolio-valuation.use-case';
import { GetPortfolioAllocationStrategyUseCase } from '../get-portfolio-allocation-strategy.use-case';
import { OpportunityRadarCacheService } from './opportunity-radar-cache.service';
import { fetchBrapiAssetIntelligence } from './brapi-intelligence.fetcher';
import { MarketDataConfigService } from '../../../market-data/market-data-config.service';
import { PortfolioNewsPipelineService } from './portfolio-news-pipeline.service';
import { PortfolioNewsInboxResult } from '@atlas/market-data';
import {
  resolvePortfolioNewsUniverseFromLedger,
  resolvePortfolioNewsUniverseFromPositions,
  type PortfolioNewsUniverseResolution,
} from './resolve-portfolio-news-tickers';

@Injectable()
export class GetOpportunityRadarUseCase {
  private readonly logger = new Logger(GetOpportunityRadarUseCase.name);

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
    @Optional()
    @Inject(PortfolioNewsPipelineService)
    private readonly newsPipelineService?: PortfolioNewsPipelineService,
    @Optional()
    @Inject(PORTFOLIO_NEWS_STATE_REPOSITORY)
    private readonly newsStateRepo?: IPortfolioNewsStateRepository,
    @Optional()
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepo?: ITransactionRepository,
    @Optional()
    @Inject(CONTRIBUTION_GOAL_REPOSITORY)
    private readonly contributionGoalRepo?: IContributionGoalRepository,
  ) {}

  private readonly newsStateSyncLocks = new Map<string, Promise<unknown>>();

  private withPortfolioNewsLock<T>(portfolioId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.newsStateSyncLocks.get(portfolioId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const cleanup = next.then(
      () => {
        if (this.newsStateSyncLocks.get(portfolioId) === cleanup) {
          this.newsStateSyncLocks.delete(portfolioId);
        }
      },
      () => {
        if (this.newsStateSyncLocks.get(portfolioId) === cleanup) {
          this.newsStateSyncLocks.delete(portfolioId);
        }
      },
    );
    this.newsStateSyncLocks.set(portfolioId, cleanup);
    return next;
  }

  async execute(params: {
    portfolioId: string;
    userId: string;
    forceRefresh?: boolean;
    now?: Date;
    enableDividendCalendarStrategy?: boolean;
  }): Promise<OpportunityRadarResult> {
    const now = params.now ?? new Date();
    const analysisDate = formatIsoDateString(now, 'America/Sao_Paulo');

    // 1. Verify portfolio ownership (anti-enumeration 404)
    const portfolio = await this.portfolioRepo.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // 2. Check cache on regular read (APP-16F PARTE X, Y)
    // If strategy toggle differs from default (true), bypass cache
    const enableDividendCalendarStrategy = params.enableDividendCalendarStrategy ?? true;
    if (!params.forceRefresh && enableDividendCalendarStrategy) {
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
    const brapiToken =
      typeof this.configService.getToken === 'function'
        ? this.configService.getToken()
        : process.env.BRAPI_API_KEY || process.env.MARKET_DATA_API_TOKEN;

    // Fetch and canonicalize news across portfolio assets (APP-16J)
    let newsInbox: PortfolioNewsInboxResult | null = null;
    let newsFetchFailed = false;
    let auditedTickersCount = 0;
    if (this.newsPipelineService) {
      if (params.forceRefresh) {
        this.newsPipelineService.clearCache();
      }
      const allTickers = positions.map((p) => p.ticker).filter((t): t is string => Boolean(t));
      auditedTickersCount = allTickers.length;
      newsInbox = await this.newsPipelineService
        .getPortfolioNews({
          tickers: allTickers,
          token: brapiToken,
          referenceDate: now,
          forceRefresh: params.forceRefresh,
        })
        .catch(() => {
          newsFetchFailed = true;
          return null;
        });
    }

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

      // External intelligence fetch (fundamentals, price history, and latest news)
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
        historicalPrices: undefined as Array<{ date: number; close: number }> | undefined,
        news: [] as OpportunityNewsItem[],
        analystConsensus: null as 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null,
        dividendEvent: null as {
          paymentDate?: string | null;
          rate?: number | null;
          relatedTo?: string | null;
          approvedOn?: string | null;
          lastDatePrior?: string | null;
          exDate?: string | null;
        } | null,
        recentPaidDividends: [] as Array<{
          paymentDate?: string | null;
          rate?: number | null;
        }>,
      };

      const brapiToken =
        typeof this.configService.getToken === 'function'
          ? this.configService.getToken()
          : process.env.BRAPI_API_KEY || process.env.MARKET_DATA_API_TOKEN;
      if (hasBrapiAuth || brapiToken || ticker === 'PETR4') {
        try {
          const fetched = await fetchBrapiAssetIntelligence({
            ticker,
            isFii,
            token: brapiToken,
            referenceDate: now,
          });
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
            historicalPrices: fetched.historicalPrices,
            news: fetched.news || [],
            analystConsensus: fetched.analystConsensus ?? null,
            dividendEvent: fetched.dividendEvent ?? null,
            recentPaidDividends: fetched.recentPaidDividends ?? [],
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

      let change5dPercent: number | null = null;
      let change21dPercent: number | null = null;
      let change63dPercent: number | null = null;

      if (extIntel.historicalPrices && extIntel.historicalPrices.length >= 5) {
        const prices = extIntel.historicalPrices;
        const lastItem = prices[prices.length - 1];
        const latestClose = lastItem ? lastItem.close : 0;
        if (latestClose > 0) {
          const idx5 = Math.max(0, prices.length - 6);
          const p5 = prices[idx5]?.close;
          if (p5 && p5 > 0) {
            change5dPercent = Math.round(((latestClose - p5) / p5) * 1000) / 10;
          }

          if (prices.length >= 21) {
            const idx21 = Math.max(0, prices.length - 22);
            const p21 = prices[idx21]?.close;
            if (p21 && p21 > 0) {
              change21dPercent = Math.round(((latestClose - p21) / p21) * 1000) / 10;
            }
          }

          if (prices.length >= 50) {
            const p63 = prices[0]?.close;
            if (p63 && p63 > 0) {
              change63dPercent = Math.round(((latestClose - p63) / p63) * 1000) / 10;
            }
          }
        }
      }

      // Build FII Dividend Calendar if asset is FII (APP-16I)
      let dividendCalendar: FiiDividendCalendarEvent | undefined = undefined;
      if (isFii) {
        if (
          extIntel.dividendEvent &&
          (extIntel.dividendEvent.lastDatePrior || extIntel.dividendEvent.paymentDate)
        ) {
          const recordDate = extIntel.dividendEvent.lastDatePrior
            ? extIntel.dividendEvent.lastDatePrior.slice(0, 10)
            : null;
          const paymentDate = extIntel.dividendEvent.paymentDate
            ? extIntel.dividendEvent.paymentDate.slice(0, 10)
            : null;
          const exDate = extIntel.dividendEvent.exDate
            ? extIntel.dividendEvent.exDate.slice(0, 10)
            : null;
          const amountPerShare = extIntel.dividendEvent.rate ?? null;
          const announcedAt = extIntel.dividendEvent.approvedOn
            ? extIntel.dividendEvent.approvedOn.slice(0, 10)
            : null;

          dividendCalendar = {
            ticker,
            recordDate,
            exDate,
            paymentDate,
            amountPerShare,
            eventStatus: 'ANNOUNCED',
            source: 'BRAPI_DIVIDENDS',
            announcedAt,
            eligibilityStatus: 'UNKNOWN',
            daysUntilRecordDate: null,
            daysUntilPayment: null,
          };
        } else {
          dividendCalendar = {
            ticker,
            recordDate: null,
            exDate: null,
            paymentDate: null,
            amountPerShare: null,
            eventStatus: 'UNKNOWN',
            source: 'BRAPI_DIVIDENDS',
            eligibilityStatus: 'UNKNOWN',
            daysUntilRecordDate: null,
            daysUntilPayment: null,
          };
        }
      }

      // Build FII Recent Paid Sources if asset is FII (APP-16I-R2)
      let recentPaidDividends: FiiCashSourceEvent[] | undefined = undefined;
      if (isFii && extIntel.recentPaidDividends && extIntel.recentPaidDividends.length > 0) {
        const qtyNum = parseFloat(pos.quantity) || 0;
        recentPaidDividends = extIntel.recentPaidDividends
          .filter((p) => p.paymentDate)
          .map((p) => {
            const amount = p.rate !== null && p.rate !== undefined ? p.rate : null;
            const estimatedCash =
              amount !== null && qtyNum > 0 ? Math.round(amount * qtyNum * 100) / 100 : null;
            return {
              ticker,
              paymentDate: p.paymentDate!,
              amountPerShare: amount,
              source: 'BRAPI_DIVIDENDS',
              paidRecently: true,
              estimatedCashReceived: estimatedCash,
            };
          });
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
        change5dPercent,
        change21dPercent,
        change63dPercent,
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
        dividendCalendar,
        recentPaidDividends,
        recentNews: combinedNews,
        portfolioNewsEvents: newsInbox ? newsInbox.events.filter((e) => e.assets.includes(ticker)) : undefined,
        analystConsensus: extIntel.analystConsensus,
      };

      evaluatedAssets.push(assetInput);
    }

    // 6. Run pure deterministic OpportunityRadarEngine (APP-16I)
    const engineResult = OpportunityRadarEngine.evaluate({
      portfolioId: params.portfolioId,
      assets: evaluatedAssets,
      analysisDate,
      referenceDate: now,
      maxResults: 5,
      enableDividendCalendarStrategy,
    });

    const newsProviderStatus: PortfolioNewsInboxMetrics['providerStatus'] | undefined =
      newsInbox?.metrics?.providerStatus ??
      (newsFetchFailed && auditedTickersCount > 0
        ? {
            brapiNewsAvailable: false,
            brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
            officialStatus: 'OFFICIAL_PROVIDER_UNAVAILABLE',
            fallbackActive: false,
            providersUsed: [],
          }
        : undefined);

    const result: OpportunityRadarResult = newsProviderStatus
      ? { ...engineResult, newsProviderStatus }
      : engineResult;

    // 7. Store in ephemeral cache (only if default strategy enabled)
    if (enableDividendCalendarStrategy) {
      this.cache.set(params.portfolioId, result, analysisDate);
    }

    return result;
  }

  /**
   * Resolves active portfolio tickers for news monitoring strictly from holdings (APP-16P-R1),
   * independent of quote freshness or valuation status.
   */
  async resolvePortfolioNewsTickers(params: {
    portfolioId: string;
    userId: string;
  }): Promise<PortfolioNewsUniverseResolution> {
    await this.assertPortfolioOwner(params.portfolioId, params.userId);

    if (this.transactionRepo) {
      const resolution = await resolvePortfolioNewsUniverseFromLedger({
        portfolioId: params.portfolioId,
        transactionRepo: this.transactionRepo,
        assetRepo: this.assetRepo,
      });
      if (resolution.ignoredWithoutTickerCount > 0) {
        this.logger.warn(
          `[APP-16P-R1] Ignored ${resolution.ignoredWithoutTickerCount} active holding(s) without valid ticker in portfolio news universe`,
        );
      }
      return resolution;
    }

    const valuation = await this.valuationUseCase.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
    });

    const resolution = resolvePortfolioNewsUniverseFromPositions(valuation.positions);
    if (resolution.ignoredWithoutTickerCount > 0) {
      this.logger.warn(
        `[APP-16P-R1] Ignored ${resolution.ignoredWithoutTickerCount} active position(s) without valid ticker in fallback news universe`,
      );
    }
    return resolution;
  }

  async getPortfolioNews(params: {
    portfolioId: string;
    userId: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<PortfolioNewsInboxResult> {
    const universe = await this.resolvePortfolioNewsTickers({
      portfolioId: params.portfolioId,
      userId: params.userId,
    });

    const tickers = universe.tickers;
    const brapiToken =
      typeof this.configService.getToken === 'function'
        ? this.configService.getToken()
        : process.env.BRAPI_API_KEY || process.env.MARKET_DATA_API_TOKEN;

    if (!this.newsPipelineService) {
      const nowIso = (params.now ?? new Date()).toISOString();
      return {
        events: [],
        totalEvents: 0,
        byAssetCount: {},
        digest: {
          date: nowIso.slice(0, 10),
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
        assetDailyStatus: {},
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
          totalAuditedAssets: tickers.length,
          assetsWithNews: 0,
          assetsWithoutNews: tickers.length,
          officialCoverageCount: 0,
          providerStatus: {
            brapiNewsAvailable: false,
            brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
            officialStatus: 'OFFICIAL_PROVIDER_UNAVAILABLE',
            cvmStatus: 'UNAVAILABLE',
            fnetStatus: 'UNAVAILABLE',
            fallbackActive: false,
            providersUsed: [],
          },
        },
        asOf: nowIso,
      };
    }

    const referenceDate = params.now ?? new Date();
    const rawInbox = await this.newsPipelineService.getPortfolioNews({
      tickers,
      token: brapiToken,
      referenceDate,
      forceRefresh: params.forceRefresh,
    });

    return this.withPortfolioNewsLock(params.portfolioId, async () => {
      const snapshot = this.newsStateRepo
        ? await this.newsStateRepo.loadSnapshot(params.portfolioId)
        : { syncState: null, eventStates: [] };

      const persistedSyncState: PersistedPortfolioNewsSyncState | null = snapshot.syncState;
      const persistedEventStates: PersistedPortfolioNewsEventState[] = snapshot.eventStates.map((row) => ({
        portfolioId: row.portfolioId,
        canonicalEventId: row.canonicalEventId,
        firstSeenAt: row.firstSeenAt,
        lastObservedAt: row.lastObservedAt,
        lastSeenByUserAt: row.lastSeenByUserAt,
        firstFingerprint: row.firstFingerprint,
        latestFingerprint: row.latestFingerprint,
        state: row.state,
        latestUpdateReasons: row.latestUpdateReasons as NewsEventUpdateReason[],
        eventPublishedAt: row.eventPublishedAt,
        meta: row.meta as PersistedPortfolioNewsEventState['meta'],
      }));

      const stateResult = applyPortfolioNewsState({
        portfolioId: params.portfolioId,
        events: rawInbox.events,
        persistedStates: persistedEventStates,
        syncState: persistedSyncState,
        referenceDate,
      });

      if (this.newsStateRepo) {
        await this.newsStateRepo.persistSnapshot({
          portfolioId: params.portfolioId,
          syncState: stateResult.syncStateToPersist,
          items: stateResult.statesToUpsert.map((item) => ({
            portfolioId: item.portfolioId,
            canonicalEventId: item.canonicalEventId,
            previousCanonicalEventId: item.previousCanonicalEventId,
            firstSeenAt: item.firstSeenAt,
            lastObservedAt: item.lastObservedAt,
            lastSeenByUserAt: item.lastSeenByUserAt,
            firstFingerprint: item.firstFingerprint,
            latestFingerprint: item.latestFingerprint,
            state: item.state,
            latestUpdateReasons: item.latestUpdateReasons,
            eventPublishedAt: item.eventPublishedAt,
            meta: item.meta as Record<string, unknown>,
          })),
        });
      }

      const updatedDigest = buildDailyNewsDigest(stateResult.events, {
        referenceDate,
        maxItems: 10,
      });

      const alertSelection = selectAlertEligibleNewsEvents({
        portfolioId: params.portfolioId,
        events: stateResult.events,
        persistedStates: stateResult.statesToUpsert,
        options: { referenceDate },
      });

      return {
        ...rawInbox,
        events: stateResult.events,
        digest: updatedDigest,
        metrics: {
          ...rawInbox.metrics,
          newEventsCount: stateResult.summary.newEventsCount,
          newMaterialEventsCount: stateResult.summary.newMaterialEventsCount,
          updatedEventsCount: stateResult.summary.updatedEventsCount,
          seenEventsCount: stateResult.summary.seenEventsCount,
        },
        newsState: stateResult.summary,
        alertsMeta: {
          baselineInitializedAt: stateResult.summary.alertsInitializedAt ?? null,
          pendingEligibleCount: alertSelection.eligibleCandidates.length,
          eligibleEvents: alertSelection.eligibleCandidates.map(({ event: _ignored, ...dto }) => dto),
        },
      };
    });
  }

  private async assertPortfolioOwner(portfolioId: string, userId: string): Promise<void> {
    const portfolio = await this.portfolioRepo.findById(portfolioId);
    if (!portfolio || portfolio.userId !== userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }
  }

  async claimPendingNewsAlerts(params: {
    portfolioId: string;
    userId: string;
    items: NewsAlertVersionRef[];
    now?: Date;
  }): Promise<{ claimed: NewsAlertVersionRef[]; skippedCount: number }> {
    await this.assertPortfolioOwner(params.portfolioId, params.userId);
    if (!this.newsStateRepo) {
      return { claimed: params.items, skippedCount: 0 };
    }
    const claimedAt = (params.now ?? new Date()).toISOString();
    return this.newsStateRepo.claimPendingNewsAlerts({
      portfolioId: params.portfolioId,
      candidates: params.items,
      claimedAt,
    });
  }

  async confirmNewsAlertsDelivered(params: {
    portfolioId: string;
    userId: string;
    items: NewsAlertDeliveryAuditItem[];
    alertAttemptId?: string;
    notificationId?: string | null;
    now?: Date;
  }): Promise<{
    confirmedCount: number;
    historyInsertedCount: number;
    duplicateSkippedCount: number;
    deliveredAt: string;
  }> {
    await this.assertPortfolioOwner(params.portfolioId, params.userId);
    const deliveredAt = (params.now ?? new Date()).toISOString();
    if (!this.newsStateRepo) {
      return {
        confirmedCount: 0,
        historyInsertedCount: 0,
        duplicateSkippedCount: 0,
        deliveredAt,
      };
    }
    const res = await this.newsStateRepo.confirmNewsAlertsDelivered({
      portfolioId: params.portfolioId,
      delivered: params.items,
      deliveredAt,
      alertAttemptId: params.alertAttemptId,
      notificationId: params.notificationId,
    });
    return {
      confirmedCount: res.confirmedCount,
      historyInsertedCount: res.historyInsertedCount,
      duplicateSkippedCount: res.duplicateSkippedCount,
      deliveredAt,
    };
  }

  async releaseNewsAlertsClaim(params: {
    portfolioId: string;
    userId: string;
    items: NewsAlertDeliveryAuditItem[];
    deliveryStatus?: Exclude<NewsAlertHistoryStatusValue, 'DELIVERED'>;
    failureReason?: string | null;
    attemptedAt?: string;
    alertAttemptId?: string;
    recordHistory?: boolean;
  }): Promise<{ releasedCount: number; historyInsertedCount: number }> {
    await this.assertPortfolioOwner(params.portfolioId, params.userId);
    if (!this.newsStateRepo) {
      return { releasedCount: 0, historyInsertedCount: 0 };
    }
    return this.newsStateRepo.releaseNewsAlertsClaim({
      portfolioId: params.portfolioId,
      items: params.items,
      deliveryStatus: params.deliveryStatus,
      failureReason: params.failureReason,
      attemptedAt: params.attemptedAt,
      alertAttemptId: params.alertAttemptId,
      recordHistory: params.recordHistory,
    });
  }

  async getPortfolioNewsAlertHistory(params: {
    portfolioId: string;
    userId: string;
    limit?: number;
    cursor?: string;
    status?: NewsAlertHistoryStatusValue;
    ticker?: string;
    materiality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
    alertType?:
      | 'CRITICAL_NEW'
      | 'CRITICAL_UPDATE'
      | 'MATERIAL_NEW'
      | 'MATERIAL_UPDATE'
      | 'MATERIAL_BATCH_SUMMARY';
    from?: string;
    to?: string;
  }): Promise<ListNewsAlertHistoryOutput> {
    await this.assertPortfolioOwner(params.portfolioId, params.userId);
    if (!this.newsStateRepo) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        metrics: {
          totalCount: 0,
          deliveredCount: 0,
          failedCount: 0,
          criticalCount: 0,
          highCount: 0,
        },
        historyAvailableSince: null,
      };
    }
    return this.newsStateRepo.listAlertHistory({
      portfolioId: params.portfolioId,
      limit: params.limit,
      cursor: params.cursor,
      status: params.status,
      ticker: params.ticker,
      materiality: params.materiality,
      alertType: params.alertType,
      from: params.from,
      to: params.to,
    });
  }

  async suppressNewsAlertsBaseline(params: {
    portfolioId: string;
    userId: string;
    items: NewsAlertVersionRef[];
    now?: Date;
  }): Promise<{ suppressedCount: number; recordedAt: string }> {
    await this.assertPortfolioOwner(params.portfolioId, params.userId);
    const recordedAt = (params.now ?? new Date()).toISOString();
    if (!this.newsStateRepo) {
      return { suppressedCount: 0, recordedAt };
    }
    const res = await this.newsStateRepo.suppressNewsAlertsBaseline({
      portfolioId: params.portfolioId,
      items: params.items,
      recordedAt,
    });
    return { suppressedCount: res.suppressedCount, recordedAt };
  }

  /**
   * Explicitly marks specific portfolio news events (or all current NEW/UPDATED events) as SEEN.
   * Strict portfolio ownership check (404 anti-enumeration).
   */
  async markPortfolioNewsSeen(params: {
    portfolioId: string;
    userId: string;
    canonicalEventIds?: string[];
    markAllNew?: boolean;
    now?: Date;
  }): Promise<{ updatedCount: number; updatedIds: string[]; seenAt: string }> {
    const portfolio = await this.portfolioRepo.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    const seenAtDate = params.now ?? new Date();
    const seenAt = seenAtDate.toISOString();

    if (!this.newsStateRepo) {
      return { updatedCount: 0, updatedIds: [], seenAt };
    }

    return this.withPortfolioNewsLock(params.portfolioId, async () =>
      this.newsStateRepo!.markSeen({
        portfolioId: params.portfolioId,
        canonicalEventIds: params.canonicalEventIds,
        markAllNovel: Boolean(params.markAllNew),
        seenAt,
      }),
    ).then((res) => ({
      updatedCount: res.updatedCount,
      updatedIds: res.updatedIds,
      seenAt,
    }));
  }

  /**
   * APP-16S: Builds the Daily Portfolio Decision Brief from the cached/evaluated Radar
   * without duplicating external provider fetches.
   * Enforces strict portfolio ownership (404 anti-enumeration).
   */
  async getDecisionBrief(params: {
    portfolioId: string;
    userId: string;
    contributionAmount?: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<PortfolioDailyDecisionBrief> {
    const now = params.now ?? new Date();
    const radar = await this.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
      forceRefresh: params.forceRefresh,
      now,
    });

    const previousRadar = this.cache.getPrevious(params.portfolioId);

    const classTargetWeights: Record<string, number> = {};
    try {
      const strategy = await this.strategyUseCase.getStrategy(params.portfolioId, params.userId);
      if (strategy?.targets) {
        for (const t of strategy.targets) {
          if (t.category && typeof t.targetBp === 'number') {
            classTargetWeights[t.category] = t.targetBp / 100;
          }
        }
      }
    } catch {
      // No allocation target configured
    }

    const evaluated = radar.allEvaluatedItems ?? radar.items;
    const classWeights: Record<string, number> = {};
    for (const item of evaluated) {
      classWeights[item.assetType] = Math.round(((classWeights[item.assetType] ?? 0) + item.portfolioWeight) * 100) / 100;
    }

    let plannedContribution: {
      amount: string;
      currency: string;
      source: 'CONTRIBUTION_GOAL' | 'USER_SIMULATION';
    } | null = null;

    if (params.contributionAmount && /^\d+(\.\d{1,2})?$/.test(params.contributionAmount.trim()) && Number(params.contributionAmount) > 0) {
      plannedContribution = {
        amount: params.contributionAmount.trim(),
        currency: 'BRL',
        source: 'USER_SIMULATION',
      };
    } else if (this.contributionGoalRepo) {
      try {
        const activeGoal = await this.contributionGoalRepo.findOpen(params.portfolioId);
        if (activeGoal && activeGoal.amount && !/^0+(\.0+)?$/.test(activeGoal.amount.trim())) {
          plannedContribution = {
            amount: activeGoal.amount,
            currency: activeGoal.currency,
            source: 'CONTRIBUTION_GOAL',
          };
        }
      } catch {
        // Contribution goal lookup is optional
      }
    }

    const providerQuality = deriveNewsProviderQuality(radar.newsProviderStatus);

    return buildPortfolioDailyDecisionBrief({
      radar,
      previousRadar,
      allocationContext: {
        classWeights,
        classTargetWeights,
      },
      plannedContribution,
      newsProviderPartial: providerQuality.newsProviderPartial,
      officialProviderStatus: providerQuality.officialProviderStatus,
      referenceDate: now,
    });
  }

  /**
   * Phase APP-16T — Contribution Allocation Simulation (Read-only analysis).
   *
   * Consumes existing Opportunity Radar and Decision Brief data to simulate an
   * explainable allocation of a user-declared contribution amount among prioritized
   * holdings. Zero orders, zero trade execution, zero DB writes, exact money conservation.
   */
  async simulateContributionAllocation(params: {
    portfolioId: string;
    userId: string;
    contributionAmount: string;
    currency?: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<ContributionAllocationSimulation> {
    const now = params.now ?? new Date();

    const decisionBrief = await this.getDecisionBrief({
      portfolioId: params.portfolioId,
      userId: params.userId,
      contributionAmount: params.contributionAmount,
      forceRefresh: params.forceRefresh,
      now,
    });

    const radar = await this.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
      forceRefresh: false,
      now,
    });

    const evaluated = radar.allEvaluatedItems ?? radar.items;

    return buildContributionAllocationSimulation({
      portfolioId: params.portfolioId,
      contributionAmount: params.contributionAmount,
      currency: params.currency || 'BRL',
      decisionBrief,
      radarItems: evaluated,
      referenceDate: now,
    });
  }

  /**
   * Phase APP-16U — Contribution Scenario Comparison (Read-only analysis).
   *
   * Compares three simulated contribution allocation modes (Cautious, Balanced, and Opportunity-Focused)
   * across prioritized holdings using a SINGLE underlying Decision Brief and Opportunity Radar resolution.
   * Zero duplicate network calls to providers, zero orders, exact money conservation.
   */
  async compareContributionScenarios(params: {
    portfolioId: string;
    userId: string;
    contributionAmount: string;
    currency?: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<ContributionScenarioComparison> {
    const now = params.now ?? new Date();

    const decisionBrief = await this.getDecisionBrief({
      portfolioId: params.portfolioId,
      userId: params.userId,
      contributionAmount: params.contributionAmount,
      forceRefresh: params.forceRefresh,
      now,
    });

    const radar = await this.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
      forceRefresh: false,
      now,
    });

    const evaluated = radar.allEvaluatedItems ?? radar.items;

    return buildContributionScenarioComparison({
      portfolioId: params.portfolioId,
      contributionAmount: params.contributionAmount,
      currency: params.currency || 'BRL',
      decisionBrief,
      radarItems: evaluated,
      referenceDate: now,
    });
  }

  /**
   * Internal helper to resolve shared projection inputs with zero provider multiplication.
   * Derives authoritative baseline positions from complete valuation read model (including unvalued/incomplete positions).
   */
  private async resolveProjectionInputs(params: {
    portfolioId: string;
    userId: string;
    contributionAmount: string;
    currency?: string;
    forceRefresh?: boolean;
    now: Date;
  }): Promise<{
    decisionBrief: PortfolioDailyDecisionBrief;
    radar: OpportunityRadarResult;
    evaluatedItems: readonly any[];
    baselinePositions: ProjectionBaselinePosition[];
    classTargetWeights: Record<string, number>;
  }> {
    const decisionBrief = await this.getDecisionBrief({
      portfolioId: params.portfolioId,
      userId: params.userId,
      contributionAmount: params.contributionAmount,
      forceRefresh: params.forceRefresh,
      now: params.now,
    });

    const radar = await this.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
      forceRefresh: false,
      now: params.now,
    });

    const evaluatedItems = radar.allEvaluatedItems ?? radar.items;

    // Load allocation targets if configured
    const classTargetWeights: Record<string, number> = {};
    try {
      const strategy = await this.strategyUseCase.getStrategy(params.portfolioId, params.userId);
      if (strategy?.targets) {
        for (const t of strategy.targets) {
          if (t.category && typeof t.targetBp === 'number') {
            classTargetWeights[t.category] = t.targetBp / 100;
          }
        }
      }
    } catch {
      // Targets are optional
    }

    // Authoritative complete holdings baseline from valuationUseCase
    const valuation = await this.valuationUseCase.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
    });

    const baselinePositions: ProjectionBaselinePosition[] = [];
    for (const pos of valuation.positions) {
      // Filter out strictly zero/closed positions if quantity is 0
      const qtyNum = parseFloat(pos.quantity) || 0;
      if (qtyNum === 0) continue;

      const isValued = Boolean(
        pos.status === 'VALUED' &&
          pos.marketValue &&
          parseFloat(pos.marketValue.amount) > 0,
      );

      let marketValueCents: number | null = null;
      if (isValued && pos.marketValue) {
        const cleaned = pos.marketValue.amount.trim().replace(',', '.');
        const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
        if (match && match[1]) {
          const whole = parseInt(match[1], 10);
          const fracStr = (match[2] || '').padEnd(2, '0');
          const frac = parseInt(fracStr.slice(0, 2), 10);
          marketValueCents = whole * 100 + frac;
        }
      }

      baselinePositions.push({
        assetId: pos.assetId,
        ticker: pos.ticker ?? pos.assetId,
        name: pos.ticker ?? undefined,
        assetType: pos.assetType ?? 'STOCK',
        quantity: pos.quantity,
        valuationStatus: pos.status,
        marketValueCents,
        quoteFreshness: (pos.quoteFreshness as any) ?? null,
        quoteAsOf: pos.quote?.asOf ?? null,
        isValued,
      });
    }

    return {
      decisionBrief,
      radar,
      evaluatedItems,
      baselinePositions,
      classTargetWeights,
    };
  }

  /**
   * Phase APP-16V — Projected Portfolio After Contribution (Read-only analysis).
   *
   * Projects portfolio weights, class gaps, and concentration before vs after a simulated contribution.
   * Single resolution of Opportunity Radar & Decision Brief, zero orders, exact money conservation.
   */
  async projectPortfolioAfterContribution(params: {
    portfolioId: string;
    userId: string;
    contributionAmount: string;
    currency?: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<ProjectedPortfolioAfterContribution> {
    const now = params.now ?? new Date();

    const inputs = await this.resolveProjectionInputs({
      portfolioId: params.portfolioId,
      userId: params.userId,
      contributionAmount: params.contributionAmount,
      currency: params.currency,
      forceRefresh: params.forceRefresh,
      now,
    });

    const simulation = buildContributionAllocationSimulation({
      portfolioId: params.portfolioId,
      contributionAmount: params.contributionAmount,
      currency: params.currency || 'BRL',
      decisionBrief: inputs.decisionBrief,
      radarItems: inputs.evaluatedItems,
      referenceDate: now,
    });

    return buildProjectedPortfolioAfterContribution({
      portfolioId: params.portfolioId,
      currency: params.currency || 'BRL',
      contributionSimulation: simulation,
      baselinePositions: inputs.baselinePositions,
      radarItems: inputs.evaluatedItems,
      classTargetWeights: inputs.classTargetWeights,
      referenceDate: now,
    });
  }

  /**
   * Phase APP-16V — Projected Portfolio Scenario Comparison (Read-only analysis).
   *
   * Compares portfolio projections across the three simulated contribution modes (Cautious, Balanced, Opportunity-Focused)
   * on the exact same baseline before state. Single resolution, zero duplicate external network calls.
   */
  async projectPortfolioScenarioComparison(params: {
    portfolioId: string;
    userId: string;
    contributionAmount: string;
    currency?: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<ProjectedPortfolioScenarioComparison> {
    const now = params.now ?? new Date();

    const inputs = await this.resolveProjectionInputs({
      portfolioId: params.portfolioId,
      userId: params.userId,
      contributionAmount: params.contributionAmount,
      currency: params.currency,
      forceRefresh: params.forceRefresh,
      now,
    });

    const scenarioComparison = buildContributionScenarioComparison({
      portfolioId: params.portfolioId,
      contributionAmount: params.contributionAmount,
      currency: params.currency || 'BRL',
      decisionBrief: inputs.decisionBrief,
      radarItems: inputs.evaluatedItems,
      referenceDate: now,
    });

    return buildProjectedPortfolioScenarioComparison({
      portfolioId: params.portfolioId,
      currency: params.currency || 'BRL',
      scenarioComparison,
      baselinePositions: inputs.baselinePositions,
      radarItems: inputs.evaluatedItems,
      classTargetWeights: inputs.classTargetWeights,
      referenceDate: now,
    });
  }
}
