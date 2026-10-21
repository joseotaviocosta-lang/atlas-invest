import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DuplicateExternalTransactionError } from '@atlas/database';
import type { ClassifiedCandidate } from '@atlas/import-engine';
import { CreateTransactionUseCase, type CreateTransactionCommand } from '../transactions';
import {
  PreviewPortfolioImportUseCase,
  type ImportRowOverride,
  type PreviewPortfolioImportCommand,
} from './preview-portfolio-import.use-case';

export interface ConfirmRowDecision {
  rowNumber: number;
  action: 'import' | 'skip';
  assetId?: string;
  accountId?: string;
}

export interface ConfirmPortfolioImportCommand extends PreviewPortfolioImportCommand {
  decisions: ConfirmRowDecision[];
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
  failed: Array<{ rowNumber: number; message: string }>;
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
    const failed: Array<{ rowNumber: number; message: string }> = [];
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
          failed.push({ rowNumber: candidate.rowNumber, message: 'Conta ou ativo não resolvido' });
        }
        continue;
      }

      if (candidate.status === 'INVALID' || candidate.status === 'UNSUPPORTED') {
        failed.push({
          rowNumber: candidate.rowNumber,
          message: candidate.issues[0]?.message ?? 'Linha inválida para importação',
        });
        continue;
      }

      if (candidate.duplicate === 'CONFLICT') {
        failed.push({
          rowNumber: candidate.rowNumber,
          message:
            'Mesmo identificador externo com valores diferentes: ajuste o arquivo ou vincule ao lançamento existente',
        });
        continue;
      }

      if (candidate.duplicate === 'PROBABLE_DUPLICATE' && decision?.action === 'import') {
        const built = this.buildCommand(command, candidate);
        if (built) {
          commands.push(built);
        } else {
          failed.push({ rowNumber: candidate.rowNumber, message: 'Conta ou ativo não resolvido' });
        }
        continue;
      }

      failed.push({
        rowNumber: candidate.rowNumber,
        message: candidate.issues[0]?.message ?? 'Linha precisa de revisão antes da importação',
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
      throw error;
    }

    return {
      receiptId: randomUUID(),
      portfolioId: command.portfolioId,
      provider: preview.provider,
      fileName: command.fileName,
      totalRows: preview.summary.totalRows,
      created: created.length,
      skippedDuplicates,
      skippedByUser,
      failed,
      transactionIds: created.map((transaction) => transaction.id),
      confirmedAt: new Date().toISOString(),
    };
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
    const failed: Array<{ rowNumber: number; message: string }> = [];
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
        });
      }
    }
    return {
      receiptId: randomUUID(),
      portfolioId: command.portfolioId,
      provider: preview.provider,
      fileName: command.fileName,
      totalRows: preview.summary.totalRows,
      created: 0,
      skippedDuplicates,
      skippedByUser,
      failed,
      transactionIds: [],
      confirmedAt: new Date().toISOString(),
    };
  }

  private buildCommand(
    command: ConfirmPortfolioImportCommand,
    candidate: ClassifiedCandidate,
  ): CreateTransactionCommand | null {
    if (!candidate.assetId || !candidate.accountId) {
      return null;
    }
    return {
      portfolioId: command.portfolioId,
      accountId: candidate.accountId,
      type: candidate.operation,
      currency: candidate.currency,
      tradeDate: candidate.tradeDate,
      settlementDate: candidate.settlementDate,
      source: 'CSV',
      provider: candidate.provider,
      externalId: candidate.externalId,
      notes: this.buildNotes(command.fileName, candidate),
      assetId: candidate.assetId,
      quantity: candidate.quantity,
      unitPrice: candidate.unitPrice,
      fees: candidate.fees !== '0' ? candidate.fees : undefined,
      userId: command.userId,
    };
  }

  private buildNotes(fileName: string, candidate: ClassifiedCandidate): string {
    const userNotes = candidate.notes ? ` — ${candidate.notes}` : '';
    return `Importado de ${fileName} (linha ${candidate.rowNumber})${userNotes}`;
  }
}
