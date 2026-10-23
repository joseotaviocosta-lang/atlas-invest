import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IIntegrationRunRepository,
  IntegrationRunRow,
  IPortfolioRepository,
} from '@atlas/database';
import {
  deriveReviewItems,
  type IntegrationReviewItem,
  type ReviewSeverity,
} from '@atlas/import-engine';
import { INTEGRATION_RUN_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';

export interface ListReviewsInput {
  limit: number;
  cursor?: string | null;
  severity?: ReviewSeverity | null;
  portfolioId?: string | null;
}

export interface IntegrationReviewListResult {
  items: IntegrationReviewItem[];
  portfolioNames: Map<string, string>;
  hasMore: boolean;
  nextCursor: string | null;
}

export type ReviewResolutionState = 'ACTIONABLE' | 'RESOLVED';
export type ReviewResolvedReason = 'CONFIRMED' | 'SUPERSEDED' | 'NO_ACTION' | 'IN_PROGRESS';

export interface IntegrationReviewDetail {
  item: IntegrationReviewItem | null;
  state: ReviewResolutionState;
  resolvedReason: ReviewResolvedReason | null;
  portfolioName: string | null;
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
    const filtered = input.severity
      ? items.filter((item) => item.severity === input.severity)
      : items;
    const lastRow = rows[rows.length - 1];
    return {
      items: filtered,
      portfolioNames: names,
      hasMore,
      nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
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
    if (item) {
      return {
        item,
        state: 'ACTIONABLE',
        resolvedReason: null,
        portfolioName: names.get(row.portfolioId) ?? null,
      };
    }
    return {
      item: null,
      state: 'RESOLVED',
      resolvedReason: this.resolvedReasonFor(row.status),
      portfolioName: names.get(row.portfolioId) ?? null,
    };
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
