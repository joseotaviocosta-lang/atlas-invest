import { ConflictException, Inject, Injectable, BadRequestException } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IIntegrationRunRepository,
  IPortfolioRepository,
  IReconciliationDecisionRepository,
  ITransactionRepository,
  ReconciliationDecisionRow,
} from '@atlas/database';
import {
  INTEGRATION_RUN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  RECONCILIATION_DECISION_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { deriveSourceItemKey, isReconciliationDecision } from '@atlas/portfolio-strategy';

type RawTx = {
  id?: { toString(): string };
  type?: string;
  tradeDate?: { toString(): string };
  currency?: string;
  assetId?: { toString(): string };
  provider?: string | null;
  externalId?: string | null;
  quantity?: { value?: string };
  unitPrice?: { amount?: string };
  amount?: { amount?: string };
};

/**
 * Phase 5S-B-R1 — record a human reconciliation decision (append-only).
 *
 * One row asserts a human reviewed the pair (run source item, local
 * transaction). Source identity is server-derived (never trusted from
 * the client): the transaction's import identity when present, else a
 * canonical fact hash. Repeat submissions return the existing row
 * (idempotent); a conflicting decision for the same pair is rejected
 * with 409 and never overwrites. Nothing here creates, edits or
 * deletes ledger transactions or run facts.
 */
@Injectable()
export class CreateReconciliationDecisionUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(RECONCILIATION_DECISION_REPOSITORY)
    private readonly decisions: IReconciliationDecisionRepository,
  ) {}

  async execute(params: {
    portfolioId: string;
    runId: string;
    transactionId: string;
    decision: string;
    userId: string;
  }): Promise<{ row: ReconciliationDecisionRow; created: boolean }> {
    if (!isReconciliationDecision(params.decision)) {
      throw new BadRequestException({
        message: `Invalid decision '${params.decision}'. Expected CONFIRM_MATCH or NOT_A_MATCH.`,
        code: 'RECONCILIATION.INVALID_DECISION',
      });
    }

    const startedAt = new Date();
    const portfolio = params.userId
      ? await this.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
      : await this.portfolios.findById(params.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }

    const run = await this.runs.findById(params.runId, params.portfolioId);
    if (!run) {
      throw new EntityNotFoundError('IntegrationRun', params.runId);
    }

    const transaction = await this.transactions.findById(params.transactionId);
    const txPortfolioId = (transaction as unknown as { portfolioId?: unknown })?.portfolioId;
    if (!transaction || String(txPortfolioId) !== params.portfolioId) {
      throw new EntityNotFoundError('Transaction', params.transactionId);
    }

    // Pair context must exist: only transactions linked to this run can
    // carry a decision about it. No link, no decision (read-only).
    const linkedIds = await this.runs.listTransactionIdsByRun(params.runId, params.portfolioId);
    if (!linkedIds.includes(params.transactionId)) {
      throw new EntityNotFoundError('IntegrationRunTransaction', params.transactionId);
    }

    const raw = transaction as unknown as RawTx;
    const sourceItemKey = deriveSourceItemKey({
      portfolioId: params.portfolioId,
      source: run.source,
      runId: params.runId,
      provider: typeof raw.provider === 'string' ? raw.provider : null,
      externalId: typeof raw.externalId === 'string' ? raw.externalId : null,
      type: typeof raw.type === 'string' ? raw.type : null,
      tradeDate: raw.tradeDate?.toString() ?? null,
      assetId: raw.assetId?.toString() ?? null,
      quantity: raw.quantity?.value ?? null,
      amount: raw.amount?.amount ?? null,
      currency: typeof raw.currency === 'string' ? raw.currency : null,
    });

    const existing = await this.decisions.findByIdentity(
      params.portfolioId,
      params.runId,
      sourceItemKey,
      params.transactionId,
    );
    if (existing) {
      if (existing.decision === params.decision) {
        return { row: existing, created: false };
      }
      throw new ConflictException({
        message: 'A conflicting reconciliation decision already exists for this item.',
        code: 'RECONCILIATION.DECISION_CONFLICT',
      });
    }

    const row = await this.decisions.create({
      portfolioId: params.portfolioId,
      integrationRunId: params.runId,
      source: run.source,
      sourceItemKey,
      localTransactionId: params.transactionId,
      decision: params.decision,
      decidedByPrincipal: params.userId,
      decidedAt: new Date(),
    });
    if (row.decision !== params.decision) {
      // Lost a race with a conflicting decision: nothing was overwritten.
      throw new ConflictException({
        message: 'A conflicting reconciliation decision already exists for this item.',
        code: 'RECONCILIATION.DECISION_CONFLICT',
      });
    }
    return { row, created: row.createdAt >= startedAt };
  }
}
