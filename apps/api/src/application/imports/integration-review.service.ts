import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IntegrationRunRow,
  IPortfolioRepository,
  IReconciliationDecisionRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  deriveReviewItems,
  type IntegrationReviewItem,
  type ReviewSeverity,
} from '@atlas/import-engine';
import { derivePairReview, type PairReviewSummary } from '@atlas/portfolio-strategy';
import {
  INTEGRATION_RUN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ASSET_REPOSITORY,
  RECONCILIATION_DECISION_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import type { Transaction } from '@atlas/domain';

export interface ListReviewsInput {
  limit: number;
  cursor?: string | null;
  severity?: ReviewSeverity | null;
  portfolioId?: string | null;
  source?: string | null;
  state?: 'PENDING' | 'RESOLVED' | 'ALL' | null;
}

export interface ReviewedReviewItem extends IntegrationReviewItem {
  pairReview: PairReviewSummary;
}

export interface IntegrationReviewListResult {
  items: ReviewedReviewItem[];
  portfolioNames: Map<string, string>;
  hasMore: boolean;
  nextCursor: string | null;
  workflow: { pendingPairs: number; resolvedPairs: number; totalPairs: number };
}

export type ReviewResolutionState = 'ACTIONABLE' | 'RESOLVED';
export type ReviewResolvedReason = 'CONFIRMED' | 'SUPERSEDED' | 'NO_ACTION' | 'IN_PROGRESS';

/** Canonical local fact for one linked transaction (never raw payloads). */
export interface ReviewLinkedTransaction {
  transactionId: string;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
  decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH' | null;
  decidedAt: string | null;
}

export interface IntegrationReviewDetail {
  item: IntegrationReviewItem | null;
  state: ReviewResolutionState;
  resolvedReason: ReviewResolvedReason | null;
  portfolioName: string | null;
  linkedTransactions: ReviewLinkedTransaction[];
  linkedTransactionsTruncated: boolean;
  pairReview: PairReviewSummary;
  limitations: string[];
}

/**
 * Phase 5P-B — derived review inbox.
 *
 * Items are projected from IntegrationRun rows on every read: no persisted
 * copy of counts, no read/dismissed flags, no drift. Ownership comes from
 * the authenticated principal's portfolios; anything else resolves to 404.
 * "Resolved" is a property of the real situation (terminal run,
 * superseded failure, in-flight execution), never of having viewed a
 * screen.
 */
@Injectable()
export class IntegrationReviewService {
  constructor(
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(RECONCILIATION_DECISION_REPOSITORY)
    private readonly decisions: IReconciliationDecisionRepository,
  ) {}

  private async ownedPortfolios(
    userId: string,
    portfolioId?: string | null,
  ): Promise<{ ids: string[]; names: Map<string, string> }> {
    const owned = await this.portfolios.findByUserId(userId);
    if (portfolioId) {
      const match = owned.find((portfolio) => String(portfolio.id) === portfolioId);
      if (!match) {
        throw new EntityNotFoundError('Portfolio', portfolioId);
      }
      return { ids: [portfolioId], names: new Map([[portfolioId, match.name]]) };
    }
    return {
      ids: owned.map((portfolio) => String(portfolio.id)),
      names: new Map(owned.map((portfolio) => [String(portfolio.id), portfolio.name])),
    };
  }

  private toDerivationInput(row: IntegrationRunRow) {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      source: row.source,
      trigger: row.trigger,
      status: row.status,
      newCandidates: row.newCandidates,
      exactDuplicates: row.exactDuplicates,
      probableDuplicates: row.probableDuplicates,
      conflicts: row.conflicts,
      unsupported: row.unsupported,
      invalid: row.invalid,
      partial: row.partial,
      reconciliation: row.reconciliation,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listReviews(userId: string, input: ListReviewsInput): Promise<IntegrationReviewListResult> {
    const { ids, names } = await this.ownedPortfolios(userId, input.portfolioId);
    let anchor: IntegrationRunRow | null = null;
    if (input.cursor) {
      anchor = await this.runs.findByIdInPortfolios(input.cursor, ids);
      if (!anchor) {
        throw new EntityNotFoundError('IntegrationRun', input.cursor);
      }
    }
    const { rows, hasMore } = await this.runs.listByPortfolioIds(ids, {
      limit: input.limit,
      cursor: anchor,
    });
    const items = deriveReviewItems(rows.map((row) => this.toDerivationInput(row)));
    const bySeverity = input.severity
      ? items.filter((item) => item.severity === input.severity)
      : items;
    const bySource = input.source
      ? bySeverity.filter((item) => item.source === input.source)
      : bySeverity;

    // Pair progress for the page runs, batched per portfolio: one
    // link-count query and one decision query per owned portfolio in
    // the page, never per-item reads.
    const runIdsByPortfolio = new Map<string, string[]>();
    for (const row of rows) {
      const list = runIdsByPortfolio.get(row.portfolioId);
      if (list) list.push(row.id);
      else runIdsByPortfolio.set(row.portfolioId, [row.id]);
    }
    const linkCountByRun = new Map<string, number>();
    const decidedByRun = new Map<string, number>();
    for (const [ownerPortfolioId, runIds] of runIdsByPortfolio) {
      const [linkCounts, decisions] = await Promise.all([
        this.runs.countLinksByRunIds(runIds, ownerPortfolioId),
        this.decisions.listByRunIds(runIds, ownerPortfolioId),
      ]);
      for (const entry of linkCounts) linkCountByRun.set(entry.runId, entry.count);
      for (const decision of decisions) {
        decidedByRun.set(
          decision.integrationRunId,
          (decidedByRun.get(decision.integrationRunId) ?? 0) + 1,
        );
      }
    }
    const reviewed: ReviewedReviewItem[] = bySource.map((item) => {
      const totalPairs = linkCountByRun.get(item.runId) ?? 0;
      const decidedPairs = decidedByRun.get(item.runId) ?? 0;
      return { ...item, pairReview: derivePairReview(totalPairs, decidedPairs) };
    });

    // Workflow filter is post-derivation on the page, like the severity
    // filter: cursors stay stable run anchors. Absent = current behavior
    // (all actionable), so pair resolution never hides import work.
    // PENDING keeps everything except fully pair-decided runs.
    const filtered =
      !input.state || input.state === 'ALL'
        ? reviewed
        : input.state === 'RESOLVED'
          ? reviewed.filter((item) => item.pairReview.status === 'RESOLVED')
          : reviewed.filter((item) => item.pairReview.status !== 'RESOLVED');

    let pendingPairs = 0;
    let resolvedPairs = 0;
    let totalPairs = 0;
    for (const item of reviewed) {
      totalPairs += item.pairReview.totalPairs;
      if (item.pairReview.status === 'RESOLVED') {
        resolvedPairs += item.pairReview.decidedPairs;
      } else if (item.pairReview.status !== 'NOT_ACTIONABLE') {
        pendingPairs += item.pairReview.totalPairs - item.pairReview.decidedPairs;
      }
    }

    const lastRow = rows[rows.length - 1];
    return {
      items: filtered,
      portfolioNames: names,
      hasMore,
      nextCursor: hasMore && lastRow ? lastRow.id : null,
      workflow: { pendingPairs, resolvedPairs, totalPairs },
    };
  }

  /**
   * Ownership-scoped portfolio id for a run. Used by mutation endpoints
   * that need the portfolio before delegating to a use-case. 404 on
   * foreign runs (anti-enumeration, never 403).
   */
  async ownedPortfolioId(userId: string, runId: string): Promise<string> {
    const { ids } = await this.ownedPortfolios(userId);
    const row = await this.runs.findByIdInPortfolios(runId, ids);
    if (!row) {
      throw new EntityNotFoundError('IntegrationRun', runId);
    }
    return row.portfolioId;
  }

  async getReview(userId: string, runId: string): Promise<IntegrationReviewDetail> {
    const { ids, names } = await this.ownedPortfolios(userId);
    const row = await this.runs.findByIdInPortfolios(runId, ids);
    if (!row) {
      throw new EntityNotFoundError('IntegrationRun', runId);
    }
    // Recovery correlation needs integration context, not just the row:
    // fetch the recent window for this (portfolio, source) so a FAILED run
    // with a newer non-failed execution derives as superseded.
    const context = await this.runs.listByPortfolioIds([row.portfolioId], { limit: 200 });
    const sameSource = context.rows.filter((candidate) => candidate.source === row.source);
    const items = deriveReviewItems(
      sameSource.map((candidate) => this.toDerivationInput(candidate)),
    );
    const item = items.find((candidate) => candidate.runId === runId) ?? null;
    const linked = await this.linkedLocalFacts(row);
    const decisions = await this.decisions.listByRun(row.id, row.portfolioId);
    const pairReview = derivePairReview(linked.total, decisions.length);
    const decisionByTx = new Map(
      decisions.map((decision) => [decision.localTransactionId, decision]),
    );
    const linkedRows = linked.rows.map((linkedRow) => {
      const decision = decisionByTx.get(linkedRow.transactionId) ?? null;
      return {
        ...linkedRow,
        decision: decision?.decision ?? null,
        decidedAt: decision ? decision.decidedAt.toISOString() : null,
      };
    });
    const limitations = this.workspaceLimitations(row, item);
    if (linked.truncated) {
      limitations.push('LINKED_TRANSACTIONS_TRUNCATED');
    }
    if (item) {
      return {
        item,
        state: 'ACTIONABLE',
        resolvedReason: null,
        portfolioName: names.get(row.portfolioId) ?? null,
        linkedTransactions: linkedRows,
        linkedTransactionsTruncated: linked.truncated,
        pairReview,
        limitations,
      };
    }
    return {
      item: null,
      state: 'RESOLVED',
      resolvedReason: this.resolvedReasonFor(row.status),
      portfolioName: names.get(row.portfolioId) ?? null,
      linkedTransactions: linkedRows,
      linkedTransactionsTruncated: linked.truncated,
      pairReview,
      limitations,
    };
  }

  /**
   * Local facts for transactions this run confirmed, bounded. Source-side
   * itemization is never persisted, so the source panel stays empty by
   * design (see SOURCE_FACTS_NOT_PERSISTED).
   */
  private async linkedLocalFacts(row: IntegrationRunRow): Promise<{
    rows: Array<Omit<ReviewLinkedTransaction, 'decision' | 'decidedAt'>>;
    truncated: boolean;
    total: number;
  }> {
    const ids = await this.runs.listTransactionIdsByRun(row.id, row.portfolioId);
    const page = ids.slice(0, REVIEW_LINKED_TRANSACTIONS_LIMIT + 1);
    const transactions = page.length > 0 ? await this.transactions.findByIds(page) : [];
    const assetIds = [
      ...new Set(
        transactions
          .map((tx) => readTransactionAssetId(tx))
          .filter((assetId): assetId is string => assetId !== null),
      ),
    ];
    const metas = assetIds.length > 0 ? await this.assets.findByIds(assetIds) : [];
    const tickerById = new Map(metas.map((asset) => [String(asset.id), asset.ticker as string]));
    const rows = transactions.slice(0, REVIEW_LINKED_TRANSACTIONS_LIMIT).map((tx) => {
      const assetId = readTransactionAssetId(tx);
      return {
        transactionId: readTransactionId(tx),
        type: readTransactionType(tx),
        tradeDate: readTransactionTradeDate(tx),
        assetId,
        ticker: assetId !== null ? (tickerById.get(assetId) ?? null) : null,
        quantity: readTransactionQuantity(tx),
        amount: readTransactionAmount(tx),
        currency: readTransactionCurrency(tx),
      };
    });
    return {
      rows,
      truncated: ids.length > REVIEW_LINKED_TRANSACTIONS_LIMIT,
      total: ids.length,
    };
  }

  private workspaceLimitations(
    row: IntegrationRunRow,
    item: IntegrationReviewItem | null,
  ): string[] {
    const limitations: string[] = [];
    const reconReasons = [
      'POSITION_DIVERGENCE',
      'MISSING_LOCAL_POSITION',
      'MISSING_SOURCE_POSITION',
      'UNRESOLVED_POSITION',
      'NEW_RECORDS',
      'PROBABLE_DUPLICATE',
      'CONFLICT',
    ];
    const reasons = item?.reasonCodes ?? [];
    if (row.reconciliation !== null || reasons.some((code) => reconReasons.includes(code))) {
      // Source snapshots and per-item entries are derived in memory
      // during preview/sync and never persisted — historical runs keep
      // counts only.
      limitations.push('SOURCE_FACTS_NOT_PERSISTED');
    }
    return limitations;
  }

  private resolvedReasonFor(status: string): ReviewResolvedReason {
    if (status === 'COMPLETED' || status === 'PARTIAL') return 'CONFIRMED';
    if (status === 'FAILED') return 'SUPERSEDED';
    if (status === 'STARTED' || status === 'CONFIRMING') return 'IN_PROGRESS';
    return 'NO_ACTION';
  }

  async countPending(userId: string): Promise<{ pendingCount: number; truncated: boolean }> {
    const { ids } = await this.ownedPortfolios(userId);
    const rows = await this.runs.listRecentByPortfolioIds(ids, 200);
    const items = deriveReviewItems(rows.map((row) => this.toDerivationInput(row)));
    return { pendingCount: items.length, truncated: rows.length >= 200 };
  }
}

/** Bounded linked-transaction page: detail stays lazy, never full dumps. */
const REVIEW_LINKED_TRANSACTIONS_LIMIT = 50;

type RawTx = {
  id?: { toString(): string };
  type?: string;
  tradeDate?: { toString(): string };
  currency?: string;
  assetId?: { toString(): string };
  quantity?: { value?: string };
  amount?: { amount?: string };
};

function readTransactionId(tx: Transaction): string {
  return (tx as unknown as RawTx).id?.toString() ?? '';
}

function readTransactionType(tx: Transaction): string | null {
  const type = (tx as unknown as RawTx).type;
  return typeof type === 'string' ? type : null;
}

function readTransactionTradeDate(tx: Transaction): string | null {
  const date = (tx as unknown as RawTx).tradeDate?.toString();
  return typeof date === 'string' ? date.slice(0, 10) : null;
}

function readTransactionAssetId(tx: Transaction): string | null {
  const assetId = (tx as unknown as RawTx).assetId?.toString();
  return typeof assetId === 'string' ? assetId : null;
}

function readTransactionQuantity(tx: Transaction): string | null {
  const quantity = (tx as unknown as RawTx).quantity?.value;
  return typeof quantity === 'string' ? quantity : null;
}

function readTransactionAmount(tx: Transaction): string | null {
  const amount = (tx as unknown as RawTx).amount?.amount;
  return typeof amount === 'string' ? amount : null;
}

function readTransactionCurrency(tx: Transaction): string | null {
  const currency = (tx as unknown as RawTx).currency;
  return typeof currency === 'string' ? currency : null;
}
