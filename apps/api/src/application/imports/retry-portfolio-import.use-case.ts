import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityNotFoundError, getPrismaClient } from '@atlas/database';
import type { IIntegrationRunRepository, IPortfolioRepository } from '@atlas/database';
import { deriveOperationalRecovery } from '@atlas/portfolio-strategy';
import {
  INTEGRATION_RUN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  PRISMA_CLIENT,
} from '../../database/tokens';
import { SourceSyncExecutorRegistry } from './source-sync-executor';
import { PrismaJobLock } from '../../ingestion/job-lock';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

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
 * Phase 5S-F-R1 — operational retry use case with distributed single-flight guarantees.
 *
 * Initiates a new attempt for a retryable interrupted or failed integration run.
 * Invariants:
 * 1. The original run in `IntegrationRun` remains completely immutable (never updated, deleted, or overwritten).
 * 2. Concurrency-safe:
 *    - Process-local mutex coalesces double-clicks within the same instance.
 *    - Distributed PostgreSQL advisory lock serializes concurrent retry calls across multiple API instances.
 *    - Cross-process callers observe and return the single factual newly-created run attempt.
 * 3. Never writes transactions directly to the ledger (creates a preview run in AWAITING_REVIEW).
 * 4. Only retryable runs are accepted; non-retryable runs fail-closed with 400 IMPORT.RETRY_NOT_AVAILABLE.
 * 5. Cross-portfolio / unowned runs resolve to 404 EntityNotFoundError (anti-enumeration).
 * 6. Lineage is documentary: ephemeral response association returned to caller.
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
    @Inject(PRISMA_CLIENT)
    private readonly prisma: AtlasPrismaClient,
  ) {}

  async execute(command: RetryPortfolioImportCommand): Promise<RetryPortfolioImportResult> {
    const lockKey = `${command.portfolioId}:${command.runId}`;
    const inFlight = this.retryLocks.get(lockKey);
    if (inFlight) {
      return inFlight;
    }

    const executionPromise = this.executeWithDistributedLock(command);
    this.retryLocks.set(lockKey, executionPromise);

    try {
      return await executionPromise;
    } finally {
      this.retryLocks.delete(lockKey);
    }
  }

  private async executeWithDistributedLock(
    command: RetryPortfolioImportCommand,
  ): Promise<RetryPortfolioImportResult> {
    const logicalLockKey = `retry:${command.portfolioId}:${command.runId}`;
    const jobLock = new PrismaJobLock(this.prisma);
    const handle = await jobLock.tryAcquire(logicalLockKey);

    if (!handle.acquired) {
      // Cross-process concurrency backstop: another API instance won the race to initiate the retry.
      // Poll briefly for the newly created attempt to become visible in the database.
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        const originalRun = await this.runs.findById(command.runId, command.portfolioId);
        if (originalRun) {
          const recentNewRun = await this.prisma.integrationRun.findFirst({
            where: {
              portfolioId: command.portfolioId,
              source: originalRun.source,
              createdAt: { gt: originalRun.createdAt },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (recentNewRun) {
            return {
              originalRunId: originalRun.id,
              newRunId: recentNewRun.id,
              status: recentNewRun.status,
              source: originalRun.source,
              message: 'Nova tentativa iniciada com sucesso. Revise os dados na tela de revisões.',
            };
          }
        }
      }
      throw new ConflictException({
        code: 'IMPORT.RETRY_ALREADY_IN_PROGRESS',
        message: 'Uma tentativa de recuperação já está em andamento para esta execução.',
      });
    }

    try {
      return await this.executeLocked(command);
    } finally {
      await handle.release();
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

    // Check if a newer attempt for this source already exists after restart
    const alreadyRetried = await this.prisma.integrationRun.findFirst({
      where: {
        portfolioId: command.portfolioId,
        source: originalRun.source,
        createdAt: { gt: originalRun.createdAt },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (alreadyRetried) {
      return {
        originalRunId: originalRun.id,
        newRunId: alreadyRetried.id,
        status: alreadyRetried.status,
        source: originalRun.source,
        message: 'Nova tentativa já iniciada para esta execução.',
      };
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
