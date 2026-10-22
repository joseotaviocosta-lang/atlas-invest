import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IIntegrationRunRepository,
  IPortfolioRepository,
  IntegrationRunReconciliation,
  IntegrationRunRow,
} from '@atlas/database';
import { INTEGRATION_RUN_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';

export interface StartIntegrationRunCommand {
  portfolioId: string;
  userId?: string;
  source: string;
  provider?: string | null;
  environment?: string | null;
  fileName?: string | null;
  /** Phase 5P-A: 'MANUAL' for human-driven runs, 'SCHEDULED' for background jobs. */
  trigger?: string | null;
}

export interface RecordRunPreviewCommand {
  runId: string;
  portfolioId: string;
  userId?: string;
  recordsFetched: number;
  recordsNormalized: number;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  /** Phase 5P-A: source returned partial data (scheduled sync). Informational at preview. */
  partial?: boolean;
  sourceAsOf?: string | null;
}

export interface RecordRunConfirmationCommand {
  runId: string;
  portfolioId: string;
  userId?: string;
  status: 'COMPLETED' | 'PARTIAL';
  confirmed: number;
  ignored: number;
  partial: boolean;
  reconciliation?: IntegrationRunReconciliation | null;
  sourceAsOf?: string | null;
}

export interface RecordRunFailureCommand {
  runId: string;
  portfolioId: string;
  userId?: string;
  errorCode: string;
  errorMessage: string;
}

/**
 * Phase 5P-PRE — operational run bookkeeping around preview/confirm.
 *
 * The service never touches the Transaction ledger: it records what the
 * pipeline decided (counts, statuses, reconciliation summaries, safe error
 * codes) so imports and syncs stay auditable after restarts. Terminal runs
 * (COMPLETED/PARTIAL/FAILED) are immutable — the repository rejects any
 * further mutation fail-closed.
 */
@Injectable()
export class IntegrationRunService {
  constructor(
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
  ) {}

  private async verifyOwnership(portfolioId: string, userId?: string): Promise<void> {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
  }

  async startRun(command: StartIntegrationRunCommand): Promise<IntegrationRunRow> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    return this.runs.create({
      portfolioId: command.portfolioId,
      source: command.source,
      provider: command.provider ?? null,
      environment: command.environment ?? null,
      fileName: command.fileName ?? null,
      trigger: command.trigger ?? null,
    });
  }

  async recordPreview(command: RecordRunPreviewCommand): Promise<IntegrationRunRow> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    return this.runs.recordPreview({
      id: command.runId,
      portfolioId: command.portfolioId,
      status: 'AWAITING_REVIEW',
      recordsFetched: command.recordsFetched,
      recordsNormalized: command.recordsNormalized,
      newCandidates: command.newCandidates,
      exactDuplicates: command.exactDuplicates,
      probableDuplicates: command.probableDuplicates,
      conflicts: command.conflicts,
      unsupported: command.unsupported,
      invalid: command.invalid,
      ...(command.partial !== undefined ? { partial: command.partial } : {}),
      ...(command.sourceAsOf !== undefined ? { sourceAsOf: command.sourceAsOf } : {}),
    });
  }

  async recordConfirmation(command: RecordRunConfirmationCommand): Promise<IntegrationRunRow> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    return this.runs.recordConfirmation({
      id: command.runId,
      portfolioId: command.portfolioId,
      status: command.status,
      confirmed: command.confirmed,
      ignored: command.ignored,
      partial: command.partial,
      reconciliation: command.reconciliation ?? null,
      ...(command.sourceAsOf !== undefined ? { sourceAsOf: command.sourceAsOf } : {}),
    });
  }

  async recordFailure(command: RecordRunFailureCommand): Promise<IntegrationRunRow> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    return this.runs.recordFailure({
      id: command.runId,
      portfolioId: command.portfolioId,
      errorCode: command.errorCode,
      errorMessage: command.errorMessage,
    });
  }

  /**
   * Links confirmed canonical transaction ids to a run. The ledger rows
   * themselves stay untouched; linkage is operational and idempotent.
   */
  async linkTransactions(
    runId: string,
    portfolioId: string,
    userId: string | undefined,
    transactionIds: string[],
  ): Promise<number> {
    await this.verifyOwnership(portfolioId, userId);
    if (transactionIds.length === 0) return 0;
    const run = await this.runs.findById(runId, portfolioId);
    if (!run) {
      throw new EntityNotFoundError('IntegrationRun', runId);
    }
    return this.runs.linkTransactions({ runId, portfolioId, transactionIds });
  }

  async getRun(portfolioId: string, runId: string, userId?: string): Promise<IntegrationRunRow> {
    await this.verifyOwnership(portfolioId, userId);
    const run = await this.runs.findById(runId, portfolioId);
    if (!run) {
      throw new EntityNotFoundError('IntegrationRun', runId);
    }
    return run;
  }

  async listRuns(
    portfolioId: string,
    userId: string | undefined,
    input: { limit: number; cursor?: string | null },
  ): Promise<{ rows: IntegrationRunRow[]; hasMore: boolean }> {
    await this.verifyOwnership(portfolioId, userId);
    // Unknown cursors resolve to 404 (anti-enumeration), never a silent reset.
    if (input.cursor) {
      const anchor = await this.runs.findById(input.cursor, portfolioId);
      if (!anchor) {
        throw new EntityNotFoundError('IntegrationRun', input.cursor);
      }
    }
    return this.runs.listByPortfolio(portfolioId, input);
  }
}
