/**
 * Phase 5E (R3-B) - MARKET_QUOTES_DAILY.
 *
 * B3 trading calendar gate first: a closed day performs zero provider calls.
 * On an open day it reuses UpdatePortfolioMarketDataUseCase per active portfolio
 * (no duplicated provider/repository logic).
 */

import { Inject, Injectable } from '@nestjs/common';
import { CalendarResolutionService } from '../../application/calendar';
import { UpdatePortfolioMarketDataUseCase } from '../../application/valuation';
import { IngestionJobType, JobExecutionContext, JobExecutionResult } from '../job-types';
import {
  IngestionJobHandler,
  civilDateFromContext,
  completedResult,
  failureResult,
  skippedResult,
} from './job-handler';
import { IIngestionPortfolioDirectory } from './portfolio-directory';
import { INGESTION_PORTFOLIO_DIRECTORY } from '../tokens';

@Injectable()
export class MarketQuotesDailyJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'MARKET_QUOTES_DAILY';

  constructor(
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(INGESTION_PORTFOLIO_DIRECTORY)
    private readonly portfolios: IIngestionPortfolioDirectory,
    @Inject(UpdatePortfolioMarketDataUseCase)
    private readonly updateMarketData: UpdatePortfolioMarketDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    const date = civilDateFromContext(ctx);
    const isTradingDay = await this.calendar.isTradingDay(date);
    if (!isTradingDay) {
      return skippedResult(
        'SKIPPED_MARKET_CLOSED',
        `B3 trading calendar closed on ${ctx.targetPeriod}`,
      );
    }

    const active = await this.portfolios.listActive();
    let requestedAssets = 0;
    let fetched = 0;
    let inserted = 0;
    let revised = 0;
    let unchanged = 0;
    let failed = 0;
    let succeeded = 0;
    let transientCode: string | null = null;
    let lastMessage: string | null = null;
    const warnings: string[] = [];

    for (const portfolio of active) {
      try {
        const receipt = await this.updateMarketData.execute({
          portfolioId: portfolio.id,
          userId: portfolio.userId,
        });
        requestedAssets += receipt.requestedAssets;
        fetched += receipt.quotesFetched;
        inserted += receipt.quotesInserted;
        revised += receipt.quotesRevised;
        unchanged += receipt.quotesUnchanged;

        const itemErrors =
          receipt.providerErrors.length +
          receipt.authRequiredAssets.length +
          receipt.missingAssets.length +
          receipt.rateLimitedAssets.length;
        failed += itemErrors;
        if (receipt.status === 'FAILED') {
          failed += 1;
          if (receipt.rateLimitedAssets.length > 0) transientCode = 'MARKET_DATA.RATE_LIMITED';
          else transientCode = transientCode ?? 'MARKET_DATA.PROVIDER_UNAVAILABLE';
        } else {
          succeeded += 1;
        }
        warnings.push(...receipt.providerErrors);
      } catch (error: unknown) {
        failed += 1;
        const mapped = failureResult(ctx, error, 'MARKET_DATA.PROVIDER_UNAVAILABLE');
        transientCode = transientCode ?? mapped.errorCode ?? null;
        lastMessage = mapped.errorMessage ?? lastMessage;
      }
    }

    const target = ctx.targetPeriod;
    const provider = 'MARKET_DATA';
    // A failed portfolio must still count as requested; use the larger of the
    // portfolio count and the asset count reported by successful use cases.
    const requested = Math.max(active.length, requestedAssets);

    if (active.length === 0) {
      return completedResult('SUCCESS', {
        itemsRequested: 0,
        itemsFetched: 0,
        itemsFailed: 0,
        provider,
        target,
        metadata: { portfolios: 0 },
      });
    }

    if (succeeded === 0) {
      return completedResult('FAILED', {
        itemsRequested: requested,
        itemsFetched: fetched,
        itemsInserted: inserted,
        itemsRevised: revised,
        itemsUnchanged: unchanged,
        itemsFailed: failed,
        provider,
        target,
        errorCode: transientCode ?? 'MARKET_DATA.PROVIDER_UNAVAILABLE',
        errorMessage: lastMessage ?? 'All portfolio market-data updates failed.',
      });
    }

    if (failed > 0) {
      return completedResult('PARTIAL', {
        itemsRequested: requested,
        itemsFetched: fetched,
        itemsInserted: inserted,
        itemsRevised: revised,
        itemsUnchanged: unchanged,
        itemsFailed: failed,
        provider,
        target,
        metadata: { portfolios: active.length, warningCount: warnings.length },
      });
    }

    return completedResult('SUCCESS', {
      itemsRequested: requested,
      itemsFetched: fetched,
      itemsInserted: inserted,
      itemsRevised: revised,
      itemsUnchanged: unchanged,
      itemsFailed: 0,
      provider,
      target,
      metadata: { portfolios: active.length },
    });
  }
}
