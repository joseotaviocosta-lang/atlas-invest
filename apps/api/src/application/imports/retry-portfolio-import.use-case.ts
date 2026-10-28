import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityNotFoundError } from '@atlas/database';
import type { IIntegrationRunRepository, IPortfolioRepository } from '@atlas/database';
import { deriveOperationalRecovery } from '@atlas/portfolio-strategy';
import { INTEGRATION_RUN_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { SourceSyncExecutorRegistry } from './source-sync-executor';

export interface RetryPortfolioImportCommand {
  portfolioId: string;
  runId: string;
  userId: string;
}

export interface RetryPortfolioImportResult {
  originalRunId: string;
  newRunId: string;
  status: string;
  source: string;
  message: string;
}

/**
 * Phase 5S-F — operational retry use case.
 *
 * Initiates a new attempt for a retryable interrupted or failed integration run.
 * Invariants:
 * 1. The original run in `IntegrationRun` remains completely immutable (never updated, deleted, or overwritten).
 * 2. Concurrency-safe: single-flight lock per (portfolioId, runId) serializes double-clicks into one execution.
 * 3. Never writes transactions directly to the ledger (creates a preview run in AWAITING_REVIEW).
 * 4. Only retryable runs are accepted; non-retryable runs fail-closed with 400 IMPORT.RETRY_NOT_AVAILABLE.
 * 5. Cross-portfolio / unowned runs resolve to 404 EntityNotFoundError (anti-enumeration).
 */
@Injectable()
export class RetryPortfolioImportUseCase {
  private readonly retryLocks = new Map<string, Promise<RetryPortfolioImportResult>>();

  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(SourceSyncExecutorRegistry)
    private readonly registry: SourceSyncExecutorRegistry,
  ) {}

  async execute(command: RetryPortfolioImportCommand): Promise<RetryPortfolioImportResult> {
    const lockKey = `${command.portfolioId}:${command.runId}`;
    const inFlight = this.retryLocks.get(lockKey);
    if (inFlight) {
      return inFlight;
    }

    const executionPromise = this.executeLocked(command);
    this.retryLocks.set(lockKey, executionPromise);

    try {
      return await executionPromise;
    } finally {
      this.retryLocks.delete(lockKey);
    }
  }

  private async executeLocked(
    command: RetryPortfolioImportCommand,
  ): Promise<RetryPortfolioImportResult> {
    const portfolio = command.userId
      ? await this.portfolios.findByIdAndUserId(command.portfolioId, command.userId)
      : await this.portfolios.findById(command.portfolioId);

    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', command.portfolioId);
    }

    const originalRun = await this.runs.findById(command.runId, command.portfolioId);
    if (!originalRun) {
      throw new EntityNotFoundError('IntegrationRun', command.runId);
    }

    const now = new Date();
    const recovery = deriveOperationalRecovery(originalRun, now);

    if (!recovery.canRetry) {
      throw new BadRequestException({
        code: 'IMPORT.RETRY_NOT_AVAILABLE',
        message: recovery.reason,
      });
    }

    const provider =
      originalRun.source === 'B3'
        ? 'SIMULATED'
        : (originalRun.provider ?? 'SIMULATED');
    const executor = this.registry.resolve(originalRun.source, provider);
    const outcome = await executor.execute({
      jobId: randomUUID(),
      attempt: 1,
      scheduleId: randomUUID(),
      portfolioId: command.portfolioId,
      source: originalRun.source,
      timezone: 'America/Sao_Paulo',
      now,
    });

    return {
      originalRunId: originalRun.id,
      newRunId: outcome.runId,
      status: 'AWAITING_REVIEW',
      source: originalRun.source,
      message: 'Nova tentativa iniciada com sucesso. Revise os dados na tela de revisões.',
    };
  }
}
