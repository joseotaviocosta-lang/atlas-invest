import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  constructor(
    @Inject(PreviewPortfolioImportUseCase)
    private readonly preview: PreviewPortfolioImportUseCase,
    @Inject(CreateTransactionUseCase)
    private readonly createTransactionUseCase: CreateTransactionUseCase,
  ) {}

  async execute(command: ConfirmPortfolioImportCommand): Promise<PortfolioImportReceipt> {
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

    const created =
      commands.length > 0 ? await this.createTransactionUseCase.executeMany(commands) : [];

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
