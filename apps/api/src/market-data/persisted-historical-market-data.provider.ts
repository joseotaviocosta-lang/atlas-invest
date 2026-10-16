import { Inject, Injectable } from '@nestjs/common';
import { IMarketQuoteRepository } from '@atlas/database';
import { LocalDate, Money, Currency } from '@atlas/domain';
import {
  HistoricalMarketDataProvider,
  HistoricalMarketPrice,
  MarketDataAssetRef,
  MarketDataSource,
} from '@atlas/market-data';
import { MARKET_QUOTE_REPOSITORY } from '../database/tokens';

/**
 * PersistedHistoricalMarketDataProvider (Phase 5A-I4, ADR-144)
 *
 * Implements HistoricalMarketDataProvider backed exclusively by the persisted
 * `market_quotes` database table.
 *
 * Strictly adheres to:
 * 1. Zero network I/O on read operations.
 * 2. Unadjusted close prices (since ledger handles corporate events).
 * 3. Exact date lookup with bounded lookback for previous trading day resolution.
 * 4. Missing quote returns UNAVAILABLE without contacting external providers.
 */
@Injectable()
export class PersistedHistoricalMarketDataProvider implements HistoricalMarketDataProvider {
  readonly provider: MarketDataSource = 'BRAPI';

  constructor(
    @Inject(MARKET_QUOTE_REPOSITORY)
    private readonly quoteRepository: IMarketQuoteRepository,
  ) {}

  async getDailyPrice(
    assetRef: MarketDataAssetRef,
    date: LocalDate,
  ): Promise<HistoricalMarketPrice> {
    const assetId = assetRef.assetId;
    // 1. Try exact date
    const exact = await this.quoteRepository.findByAssetDate(assetId, date);
    if (exact) {
      return {
        assetId,
        date,
        close: Money.from(exact.close, exact.currency as Currency),
        currency: exact.currency as Currency,
        source: exact.provider as MarketDataSource,
        status: 'EXACT',
      };
    }

    // 2. Lookback for previous trading day within 7 days
    const lookbackDays = 7;
    const fromJs = new Date(
      Date.UTC(date.year, date.month - 1, date.day) - lookbackDays * 24 * 60 * 60 * 1000,
    );
    const fromDate = LocalDate.fromParts(
      fromJs.getUTCFullYear(),
      fromJs.getUTCMonth() + 1,
      fromJs.getUTCDate(),
    );

    const rangeQuotes = await this.quoteRepository.findRange(assetId, fromDate, date);
    if (rangeQuotes.length > 0) {
      // Pick the latest available quote strictly before or on date
      const sorted = [...rangeQuotes].sort((a, b) => b.tradingDate.compare(a.tradingDate));
      const latestPrior = sorted.find((q) => q.tradingDate.compare(date) <= 0);
      if (latestPrior) {
        return {
          assetId,
          date: latestPrior.tradingDate,
          close: Money.from(latestPrior.close, latestPrior.currency as Currency),
          currency: latestPrior.currency as Currency,
          source: latestPrior.provider as MarketDataSource,
          status: 'PREVIOUS_TRADING_DAY',
        };
      }
    }

    return {
      assetId,
      date,
      close: Money.from('0.01', assetRef.currency),
      currency: assetRef.currency,
      source: 'BRAPI',
      status: 'UNAVAILABLE',
    };
  }

  async getDailyPrices(
    assetRef: MarketDataAssetRef,
    from: LocalDate,
    to: LocalDate,
  ): Promise<HistoricalMarketPrice[]> {
    const assetId = assetRef.assetId;
    const quotes = await this.quoteRepository.findRange(assetId, from, to);

    return quotes.map((q) => ({
      assetId,
      date: q.tradingDate,
      close: Money.from(q.close, q.currency as Currency),
      currency: q.currency as Currency,
      source: q.provider as MarketDataSource,
      status: 'EXACT',
    }));
  }
}
