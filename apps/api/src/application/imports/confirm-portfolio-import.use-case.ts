import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DuplicateExternalTransactionError } from '@atlas/database';
import type { ClassifiedCandidate } from '@atlas/import-engine';
import { CreateTransactionUseCase, type CreateTransactionCommand } from '../transactions';
import { ImportValidationError } from './import-validation.error';
import {
  PreviewPortfolioImportUseCase,
  type ImportRowOverride,
  type PreviewPortfolioImportCommand,
} from './preview-portfolio-import.use-case';
import { IntegrationRunService } from './integration-run.service';

export interface ConfirmRowDecision {
  rowNumber: number;
  action: 'import' | 'skip';
  assetId?: string;
  accountId?: string;
}

export interface ConfirmPortfolioImportCommand extends PreviewPortfolioImportCommand {
  decisions: ConfirmRowDecision[];
  /**
   * Phase 5P-PRE: operational run opened by preview. When present, confirmed
   * rows are stamped with the run id and the run records the outcome.
   * Absent preserves the legacy unlink behavior.
   */
  runId?: string;
}

export type ImportRowFailureKind = 'pending-review' | 'unsupported' | 'error';

export interface ImportRowFailure {
  rowNumber: number;
  message: string;
  /**
   * Selective-confirmation semantics: only 'error' means an unexpected
   * processing/persistence failure. 'pending-review' rows stay re-previewable
   * (never user-ignored); 'unsupported' rows were deliberately not persisted.
   * Neither ever counts as a technical error.
   */
  kind: ImportRowFailureKind;
}

export interface PortfolioImportReceipt {
  receiptId: string;
  portfolioId: string;
  provider: string;
  fileName: string;
  totalRows: number;
  created: number;
  skippedDuplicates: number;
  skippedByUser: number;
  failed: ImportRowFailure[];
  /** Server-derived outcome breakdown (single source of truth for receipt UI). */
  pendingReviewCount: number;
  unsupportedCount: number;
  errorCount: number;
  transactionIds: string[];
  confirmedAt: string;
}

@Injectable()
export class ConfirmPortfolioImportUseCase {
  /**
   * Portfolio-scoped confirm serialization (Phase 5K-R1).
   *
   * The duplicate pre-check reads committed ledger state, so two concurrent
   * confirms for the same portfolio must not interleave check-then-write.
   * This in-process mutex serializes confirms per portfolioId; the
   * (portfolioId, provider, externalId) unique constraint remains the
   * backstop for external-id collisions across processes, and unique
   * violations are recovered into idempotent receipts below.
   */
  private readonly confirmLocks = new Map<string, Promise<void>>();

  constructor(
    @Inject(PreviewPortfolioImportUseCase)
    private readonly preview: PreviewPortfolioImportUseCase,
    @Inject(CreateTransactionUseCase)
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    @Inject(IntegrationRunService)
    private readonly runService: IntegrationRunService,
  ) {}

  async execute(command: ConfirmPortfolioImportCommand): Promise<PortfolioImportReceipt> {
    return this.withPortfolioLock(command.portfolioId, () => this.executeLocked(command));
  }

  private async withPortfolioLock<T>(portfolioId: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.confirmLocks.get(portfolioId) ?? Promise.resolve();
    let release: () => void = () => {};
    const head = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = tail.then(() => head);
    this.confirmLocks.set(portfolioId, chained);
    await tail;
    try {
      return await fn();
    } finally {
      release();
      if (this.confirmLocks.get(portfolioId) === chained) {
        this.confirmLocks.delete(portfolioId);
      }
    }
  }

  private async executeLocked(
    command: ConfirmPortfolioImportCommand,
  ): Promise<PortfolioImportReceipt> {
    // Fail fast on spent or foreign runs: only AWAITING_REVIEW runs accept
    // confirmation. Unknown/forged ids resolve to 404 via ownership check.
    if (command.runId) {
      const run = await this.runService.getRun(command.portfolioId, command.runId, command.userId);
      if (run.status !== 'AWAITING_REVIEW') {
        throw new ImportValidationError(
          'Esta execução já foi concluída e não aceita nova confirmação',
        );
      }
    }
    const overrides = new Map<number, ImportRowOverride>();
    for (const decision of command.decisions) {
      if (decision.assetId || decision.accountId) {
        overrides.set(decision.rowNumber, {
          assetId: decision.assetId,
          accountId: decision.accountId,
        });
      }
    }
    const preview = await this.preview.executeWithOverrides(command, overrides);
    const decisions = new Map(command.decisions.map((decision) => [decision.rowNumber, decision]));

    const commands: CreateTransactionCommand[] = [];
    const failed: ImportRowFailure[] = [];
    let skippedDuplicates = 0;
    let skippedByUser = 0;

    for (const candidate of preview.candidates) {
      const decision = decisions.get(candidate.rowNumber);
      if (decision?.action === 'skip') {
        skippedByUser += 1;
        continue;
      }

      if (candidate.status === 'DUPLICATE') {
        skippedDuplicates += 1;
        continue;
      }

      if (candidate.status === 'READY') {
        const built = this.buildCommand(command, candidate);
        if (built) {
          commands.push(built);
        } else {
          failed.push({ rowNumber: candidate.rowNumber, message: 'Conta ou ativo não resolvido', kind: 'error' });
        }
        continue;
      }

      if (candidate.status === 'INVALID' || candidate.status === 'UNSUPPORTED') {
        failed.push({
          rowNumber: candidate.rowNumber,
          message: candidate.issues[0]?.message ?? 'Linha inválida para importação',
          kind: candidate.status === 'UNSUPPORTED' ? 'unsupported' : 'error',
        });
        continue;
      }

      if (candidate.duplicate === 'CONFLICT') {
        failed.push({
          rowNumber: candidate.rowNumber,
          message:
            'Mesmo identificador externo com valores diferentes: ajuste o arquivo ou vincule ao lançamento existente',
          kind: 'error',
        });
        continue;
      }

      if (candidate.duplicate === 'PROBABLE_DUPLICATE' && decision?.action === 'import') {
        const built = this.buildCommand(command, candidate);
        if (built) {
          commands.push(built);
        } else {
          failed.push({ rowNumber: candidate.rowNumber, message: 'Conta ou ativo não resolvido', kind: 'error' });
        }
        continue;
      }

      // NEEDS_REVIEW (and any other non-importable state): left pending, never
      // persisted, never marked as user-ignored. Re-preview reproduces the set.
      failed.push({
        rowNumber: candidate.rowNumber,
        message: candidate.issues[0]?.message ?? 'Linha precisa de revisão antes da importação',
        kind: candidate.status === 'NEEDS_REVIEW' ? 'pending-review' : 'error',
      });
    }

    let created: { id: string }[];
    try {
      created =
        commands.length > 0 ? await this.createTransactionUseCase.executeMany(commands) : [];
    } catch (error) {
      if (error instanceof DuplicateExternalTransactionError) {
        return this.recoverIdempotentReceipt(command);
      }
      await this.recordConfirmFailure(command, error);
      throw error;
    }

    const pendingReviewCount = failed.filter((entry) => entry.kind === 'pending-review').length;
    const unsupportedCount = failed.filter((entry) => entry.kind === 'unsupported').length;
    const errorCount = failed.filter((entry) => entry.kind === 'error').length;
    const receipt: PortfolioImportReceipt = {
      receiptId: randomUUID(),
      portfolioId: command.portfolioId,
      provider: preview.provider,
      fileName: command.fileName,
      totalRows: preview.summary.totalRows,
      created: created.length,
      skippedDuplicates,
      skippedByUser,
      failed,
      pendingReviewCount,
      unsupportedCount,
      errorCount,
      transactionIds: created.map((transaction) => transaction.id),
      confirmedAt: new Date().toISOString(),
    };
    // Phase 5P-PRE: the run records what the ledger actually received —
    // never what was merely previewed. CSV has no source snapshot, so no
    // reconciliation summary is stored here.
    if (command.runId) {
      await this.runService.linkTransactions(
        command.runId,
        command.portfolioId,
        command.userId,
        created.map((transaction) => transaction.id),
      );
      // Selective confirmation: rows left pending review keep the run PARTIAL
      // instead of marking everything resolved. Skipped-by-user rows are NOT
      // pending (explicit ignore); NEEDS_REVIEW leftovers are.
      // PARTIAL != ERROR: actual errors surface via receipt.errorCount.
      const runPendingReviewCount = failed.filter((entry) => entry.kind === 'pending-review').length;
      await this.runService.recordConfirmation({
        runId: command.runId,
        portfolioId: command.portfolioId,
        userId: command.userId,
        status: runPendingReviewCount > 0 ? 'PARTIAL' : 'COMPLETED',
        confirmed: created.length,
        // Rejected rows (invalid, unsupported, undecided) count as ignored:
        // confirmed + ignored always reconciles to the previewed total.
        ignored: skippedDuplicates + skippedByUser + failed.length,
        partial: runPendingReviewCount > 0,
      });
    }
    return receipt;
  }

  /**
   * Records an operational failure on the run (safe code + message only)
   * before surfacing the original error. No raw payloads, no stacks.
   */
  private async recordConfirmFailure(
    command: ConfirmPortfolioImportCommand,
    error: unknown,
  ): Promise<void> {
    if (!command.runId) return;
    const message = error instanceof Error ? error.message : 'Falha ao confirmar a importação';
    try {
      await this.runService.recordFailure({
        runId: command.runId,
        portfolioId: command.portfolioId,
        userId: command.userId,
        errorCode: 'IMPORT.CONFIRM_FAILED',
        errorMessage: message.slice(0, 500),
      });
    } catch {
      // Run bookkeeping must never mask the original confirm failure.
    }
  }

  /**
   * Cross-process backstop: if a concurrent confirm committed the same
   * external id first, the unique constraint rejects this batch. Re-run
   * the reconciliation against committed state and return the idempotent
   * receipt instead of surfacing a conflict to the investor.
   */
  private async recoverIdempotentReceipt(
    command: ConfirmPortfolioImportCommand,
  ): Promise<PortfolioImportReceipt> {
    const overrides = new Map<number, ImportRowOverride>();
    for (const decision of command.decisions) {
      if (decision.assetId || decision.accountId) {
        overrides.set(decision.rowNumber, {
          assetId: decision.assetId,
          accountId: decision.accountId,
        });
      }
    }
    const preview = await this.preview.executeWithOverrides(command, overrides);
    const decisions = new Map(command.decisions.map((decision) => [decision.rowNumber, decision]));
    let skippedDuplicates = 0;
    let skippedByUser = 0;
    const failed: ImportRowFailure[] = [];
    for (const candidate of preview.candidates) {
      const decision = decisions.get(candidate.rowNumber);
      if (decision?.action === 'skip') {
        skippedByUser += 1;
      } else if (candidate.status === 'DUPLICATE') {
        skippedDuplicates += 1;
      } else {
        failed.push({
          rowNumber: candidate.rowNumber,
          message:
            candidate.issues[0]?.message ??
            'Linha não importada: outra confirmação simultânea escreveu o lançamento',
          kind: 'error',
        });
      }
    }
    const receipt: PortfolioImportReceipt = {
      receiptId: randomUUID(),
      portfolioId: command.portfolioId,
      provider: preview.provider,
      fileName: command.fileName,
      totalRows: preview.summary.totalRows,
      created: 0,
      skippedDuplicates,
      skippedByUser,
      failed,
      pendingReviewCount: failed.filter((entry) => entry.kind === 'pending-review').length,
      unsupportedCount: failed.filter((entry) => entry.kind === 'unsupported').length,
      errorCount: failed.filter((entry) => entry.kind === 'error').length,
      transactionIds: [],
      confirmedAt: new Date().toISOString(),
    };
    if (command.runId) {
      await this.runService.recordConfirmation({
        runId: command.runId,
        portfolioId: command.portfolioId,
        userId: command.userId,
        status: 'COMPLETED',
        confirmed: 0,
        ignored: skippedDuplicates + skippedByUser + failed.length,
        partial: false,
      });
    }
    return receipt;
  }

  private buildCommand(
    command: ConfirmPortfolioImportCommand,
    candidate: ClassifiedCandidate,
  ): CreateTransactionCommand | null {
    if (!candidate.assetId || !candidate.accountId) {
      return null;
    }
    const base = {
      portfolioId: command.portfolioId,
      accountId: candidate.accountId,
      currency: candidate.currency,
      tradeDate: candidate.tradeDate,
      settlementDate: candidate.settlementDate,
      // Phase 5M: the ledger source mirrors the originating provider.
      // CSV flows keep 'CSV'; B3 flows record 'B3'.
      source: (candidate.provider.includes('B3') ||
      command.sourceType === 'B3_NEGOTIATION_XLSX' ||
      command.sourceType === 'B3_ANNUAL_REPORT_XLSX' ||
      command.sourceType === 'B3_MOVEMENT_XLSX'
        ? 'B3'
        : 'CSV') as CreateTransactionCommand['source'],
      provider: candidate.provider,
      externalId: candidate.externalId,
      notes: this.buildNotes(command.fileName, candidate),
      assetId: candidate.assetId,
    };
    // Phase 5O-A: income events persist through the canonical income path
    // (value-only: amount, never quantity/price/fees). No withholding is
    // ever inferred: the ledger carries the known credited value as-is.
    if (
      candidate.operation === 'DIVIDEND' ||
      candidate.operation === 'JCP' ||
      candidate.operation === 'FII_INCOME'
    ) {
      if (!candidate.amount) {
        return null;
      }
      return {
        ...base,
        type: candidate.operation,
        amount: candidate.amount,
        userId: command.userId,
      };
    }
    // Phase 5M: mirrored custody-transfer legs persist with their shared
    // transferGroupId (never as economic acquisitions).
    if (candidate.operation === 'TRANSFER_IN' || candidate.operation === 'TRANSFER_OUT') {
      return {
        ...base,
        type: candidate.operation,
        quantity: candidate.quantity,
        ...(candidate.transferGroupId ? { transferGroupId: candidate.transferGroupId } : {}),
        userId: command.userId,
      };
    }
    // Phase R1: bonus corporate actions persist quantity-only. No unitPrice,
    // no fees, no assignedCost: the credited shares have unknown acquisition
    // cost and the engine keeps costBasisStatus INCOMPLETE (never zero).
    if (candidate.operation === 'BONUS') {
      return {
        ...base,
        type: candidate.operation,
        quantity: candidate.quantity,
        userId: command.userId,
      };
    }
    return {
      ...base,
      type: candidate.operation,
      quantity: candidate.quantity,
      unitPrice: candidate.unitPrice,
      fees: candidate.fees !== '0' ? candidate.fees : undefined,
      ...(candidate.transferGroupId ? { transferGroupId: candidate.transferGroupId } : {}),
      userId: command.userId,
    };
  }

  private buildNotes(fileName: string, candidate: ClassifiedCandidate): string {
    const userNotes = candidate.notes ? ` — ${candidate.notes}` : '';
    return `Importado de ${fileName} (linha ${candidate.rowNumber})${userNotes}`;
  }
}
