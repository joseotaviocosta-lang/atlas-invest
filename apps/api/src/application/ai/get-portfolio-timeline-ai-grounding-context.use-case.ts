import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  buildPortfolioTimelineAiGroundingContext,
  PortfolioTimelineAiGroundingContextV1,
  PortfolioAiEventV1,
  MAX_TIMELINE_RANGE_DAYS,
} from '@atlas/ai-engine';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';

export interface GetPortfolioTimelineAiGroundingContextParams {
  readonly portfolioId: string;
  readonly userId: string;
  readonly from?: string; // YYYY-MM-DD
  readonly to?: string; // YYYY-MM-DD
  readonly startDate?: string; // alias for from
  readonly endDate?: string; // alias for to
  readonly assetId?: string;
}

/**
 * GetPortfolioTimelineAiGroundingContextUseCase (Phase 3X, ADR-216–ADR-221)
 *
 * Transports canonical portfolio history and events into a versioned, bounded,
 * immutable AI grounding context for timeline and event-scoped queries.
 *
 * Invariants:
 * - Portfolio ownership validated (anti-enumeration 404).
 * - Date ranges must be valid civil calendar dates, from <= to, and bounded to MAX_TIMELINE_RANGE_DAYS (366 days).
 * - Historical asset queries verify the asset has transactions in this portfolio (anti-tampering 404).
 * - Zero raw ledger rows sent to provider.
 * - Zero new financial calculation algorithms.
 * - Exact-decimal representations preserved.
 */
@Injectable()
export class GetPortfolioTimelineAiGroundingContextUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(
    params: GetPortfolioTimelineAiGroundingContextParams,
  ): Promise<PortfolioTimelineAiGroundingContextV1> {
    // 1. Ownership validation (Hidden 404 anti-enumeration)
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // 2. Validate economic date ranges
    const fromInput = params.from ?? params.startDate;
    const toInput = params.to ?? params.endDate;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const now = new Date();
    const todayLocalDate = LocalDate.fromParts(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
    );

    let toLocalDate: LocalDate;
    if (toInput) {
      if (!dateRegex.test(toInput)) {
        throw new BadRequestException({
          message: `Invalid 'to' date format '${toInput}'. Expected YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
      try {
        toLocalDate = LocalDate.from(toInput);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil date '${toInput}'`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    } else {
      toLocalDate = todayLocalDate;
    }

    let fromLocalDate: LocalDate;
    if (fromInput) {
      if (!dateRegex.test(fromInput)) {
        throw new BadRequestException({
          message: `Invalid 'from' date format '${fromInput}'. Expected YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
      try {
        fromLocalDate = LocalDate.from(fromInput);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil date '${fromInput}'`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    } else {
      // Default: 30 days prior to toLocalDate
      const pastMs =
        Date.UTC(toLocalDate.year, toLocalDate.month - 1, toLocalDate.day) - 30 * 86400000;
      const pastDate = new Date(pastMs);
      fromLocalDate = LocalDate.fromParts(
        pastDate.getUTCFullYear(),
        pastDate.getUTCMonth() + 1,
        pastDate.getUTCDate(),
      );
    }

    // from <= to
    if (fromLocalDate.compare(toLocalDate) > 0) {
      throw new BadRequestException({
        message: `Invalid date range: 'from' date (${fromLocalDate.toString()}) must be <= 'to' date (${toLocalDate.toString()})`,
        code: 'PORTFOLIO.INVALID_DATE_RANGE',
      });
    }

    // Range ceiling check (MAX_TIMELINE_RANGE_DAYS = 366 days)
    const diffMs =
      Date.UTC(toLocalDate.year, toLocalDate.month - 1, toLocalDate.day) -
      Date.UTC(fromLocalDate.year, fromLocalDate.month - 1, fromLocalDate.day);
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays > MAX_TIMELINE_RANGE_DAYS) {
      throw new BadRequestException({
        message: `Date range exceeds maximum allowed limit of ${MAX_TIMELINE_RANGE_DAYS} days (${diffDays} days requested)`,
        code: 'PORTFOLIO.DATE_RANGE_EXCEEDED',
      });
    }

    // 3. Load transactions up to toLocalDate
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: toLocalDate,
    });

    // 4. Asset historical authorization check (if ASSET_TIMELINE scope)
    let assetSymbol: string | undefined;
    let assetName: string | undefined;

    if (params.assetId) {
      const hasAssetHistory = transactions.some(
        (t) => 'assetId' in t && String(t.assetId) === params.assetId,
      );
      if (!hasAssetHistory) {
        throw new NotFoundException({
          message: `Asset with id '${params.assetId}' not found in portfolio '${params.portfolioId}' history`,
          code: 'PORTFOLIO.ASSET_NOT_FOUND',
        });
      }
      const assetRecord = await this.assetRepository.findById(params.assetId);
      if (assetRecord) {
        assetSymbol = assetRecord.ticker;
        assetName = assetRecord.name;
      }
    }

    // 5. Replay portfolio ledger deterministically
    const replay = replayPortfolio({
      portfolioId: params.portfolioId,
      transactions,
      asOfDate: toLocalDate,
    });

    // 6. Map canonical events into provider-safe PortfolioAiEventV1 projection
    const candidateEvents: PortfolioAiEventV1[] = [];

    // 6.1 BUY events from applied transactions
    for (const tx of replay.appliedTransactions) {
      if (tx.type === 'BUY') {
        const moneyAmount = tx.unitPrice.multiply(tx.quantity).amount;
        candidateEvents.push({
          eventId: `tx_${tx.id}`,
          eventType: 'BUY',
          economicDate: tx.tradeDate.toString(),
          assetId: tx.assetId ? String(tx.assetId) : undefined,
          quantity: tx.quantity ? tx.quantity.value : undefined,
          moneyAmount,
          currency: tx.unitPrice.currency,
          nature: 'HISTORICAL',
        });
      }
    }

    // 6.2 SELL events from realized disposals
    for (const d of replay.state.realizedDisposals) {
      candidateEvents.push({
        eventId: `rd_${d.transactionId}`,
        eventType: 'SELL',
        economicDate: d.tradeDate.toString(),
        assetId: String(d.assetId),
        quantity: d.quantity.value,
        moneyAmount: d.netProceeds ? d.netProceeds.amount : d.grossProceeds.amount,
        currency: d.currency,
        nature: 'HISTORICAL',
        details: d.realizedGainLoss ? { realizedGainLoss: d.realizedGainLoss.amount } : undefined,
      });
    }

    // 6.3 INCOME events (DIVIDEND, JCP)
    for (const inc of replay.state.incomeEvents) {
      candidateEvents.push({
        eventId: `inc_${inc.transactionId}`,
        eventType:
          inc.type === 'JCP'
            ? 'JCP'
            : inc.type === 'DIVIDEND'
              ? 'DIVIDEND'
              : 'OTHER_CORPORATE_ACTION',
        economicDate: inc.tradeDate.toString(),
        assetId: inc.assetId ? String(inc.assetId) : undefined,
        moneyAmount: inc.amount.amount,
        currency: inc.currency,
        nature: 'HISTORICAL',
      });
    }

    // 6.4 CASH_FLOW events (CASH_DEPOSIT, CASH_WITHDRAWAL)
    for (const cf of replay.state.cashFlowEvents) {
      candidateEvents.push({
        eventId: `cf_${cf.transactionId}`,
        eventType: cf.direction === 'INFLOW' ? 'CASH_DEPOSIT' : 'CASH_WITHDRAWAL',
        economicDate: cf.tradeDate.toString(),
        assetId: cf.relatedAssetId ? String(cf.relatedAssetId) : undefined,
        moneyAmount: cf.amount.amount,
        currency: cf.currency,
        nature: 'HISTORICAL',
      });
    }

    // 6.5 CORPORATE_ACTION events (conversions surface as
    // OTHER_CORPORATE_ACTION: the AI layer explains canonical facts and must
    // not gain a new financial event type in this phase).
    for (const ca of replay.state.appliedCorporateActions) {
      candidateEvents.push({
        eventId: `ca_${ca.transactionId}`,
        eventType: ca.type === 'RECEIPT_CONVERSION' ? 'OTHER_CORPORATE_ACTION' : ca.type,
        economicDate: ca.tradeDate.toString(),
        assetId: String(ca.assetId),
        quantity: ca.afterQuantity ? ca.afterQuantity.value : undefined,
        nature: 'HISTORICAL',
      });
    }

    // 6.6 TRANSFER events
    for (const tr of replay.state.appliedTransfers) {
      candidateEvents.push({
        eventId: `tr_${tr.transactionId}`,
        eventType: tr.type === 'TRANSFER_IN' ? 'TRANSFER_IN' : 'TRANSFER_OUT',
        economicDate: tr.tradeDate.toString(),
        assetId: String(tr.assetId),
        quantity: tr.quantity.value,
        moneyAmount: tr.carriedCost ? tr.carriedCost.amount : undefined,
        currency: tr.carriedCost ? tr.carriedCost.currency : undefined,
        nature: 'HISTORICAL',
      });
    }

    // 7. Batch resolve asset metadata (anti-N+1 query)
    const uniqueAssetIds = Array.from(
      new Set(candidateEvents.map((e) => e.assetId).filter(Boolean)),
    ) as string[];

    const assetMetaMap = new Map<string, { symbol?: string; name?: string }>();
    if (params.assetId && assetSymbol) {
      assetMetaMap.set(params.assetId, { symbol: assetSymbol, name: assetName });
    }

    for (const id of uniqueAssetIds) {
      if (!assetMetaMap.has(id)) {
        const record = await this.assetRepository.findById(id);
        if (record) {
          assetMetaMap.set(id, { symbol: record.ticker, name: record.name });
        }
      }
    }

    const enrichedEvents = candidateEvents.map((e) => {
      if (e.assetId && assetMetaMap.has(e.assetId)) {
        const meta = assetMetaMap.get(e.assetId)!;
        return {
          ...e,
          symbol: meta.symbol,
          assetName: meta.name,
        };
      }
      return e;
    });

    // 8. Build pure immutable timeline context
    return buildPortfolioTimelineAiGroundingContext({
      portfolioId: params.portfolioId,
      period: {
        from: fromLocalDate.toString(),
        to: toLocalDate.toString(),
      },
      scope: params.assetId
        ? {
            type: 'ASSET_TIMELINE',
            assetId: params.assetId,
            from: fromLocalDate.toString(),
            to: toLocalDate.toString(),
            symbol: assetSymbol,
            name: assetName,
          }
        : {
            type: 'TIMELINE',
            from: fromLocalDate.toString(),
            to: toLocalDate.toString(),
          },
      candidateEvents: enrichedEvents,
    });
  }
}
