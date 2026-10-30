import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  LocalDate,
  Quantity,
  Transaction,
  TransactionFactory,
  InvalidTransactionError,
} from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { normalizeDecimalValue } from '@atlas/import-engine';
import type {
  ITransactionRepository,
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
} from '@atlas/database';
import { EntityNotFoundError, CrossPortfolioIntegrityError } from '@atlas/database';
import {
  TRANSACTION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';

/**
 * Owner-controlled manual corporate-action entry (SPLIT / REVERSE_SPLIT).
 *
 * Two-step flow: preview (sequential in-memory projection from live ledger
 * state, never persisted) then atomic confirm (validate ALL, persist ALL in
 * one database transaction, fail closed). Explicit whitelist — no other
 * canonical type can pass, however the client labels it.
 */

export const MANUAL_CORPORATE_ACTION_TYPES = ['SPLIT', 'REVERSE_SPLIT'] as const;
export type ManualCorporateActionType = (typeof MANUAL_CORPORATE_ACTION_TYPES)[number];

export interface CorporateActionLegInput {
  assetId: string;
  type: ManualCorporateActionType;
  tradeDate: string;
  factor: string;
  notes?: string;
  externalId?: string;
}

export interface CorporateActionBatchCommand {
  portfolioId: string;
  accountId: string;
  userId: string;
  currency: string;
  legs: CorporateActionLegInput[];
}

export interface CorporateActionLegPreview {
  index: number;
  assetId: string;
  assetTicker: string | null;
  type: ManualCorporateActionType;
  tradeDate: string;
  factor: string;
  status: 'READY' | 'DUPLICATE' | 'INVALID';
  message: string | null;
  beforeQuantity: string | null;
  afterQuantity: string | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE' | null;
  fractionWarning: string | null;
}

export interface PreviewCorporateActionsResult {
  legs: CorporateActionLegPreview[];
  projectedQuantities: Array<{
    assetId: string;
    assetTicker: string | null;
    beforeQuantity: string | null;
    afterQuantity: string | null;
  }>;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  taxMessage: string;
  ledgerFingerprint: string;
  readyCount: number;
}

export interface ConfirmCorporateActionsCommand extends CorporateActionBatchCommand {
  expectedLedgerFingerprint: string;
}

export const CORPORATE_ACTION_TAX_MESSAGE =
  'Este evento corporativo não gera venda, ganho realizado ou DARF.';

function isManualCorporateActionType(value: string): value is ManualCorporateActionType {
  return (MANUAL_CORPORATE_ACTION_TYPES as readonly string[]).includes(value);
}

function ledgerFingerprint(portfolioId: string, transactions: Transaction[]): string {
  const ids = transactions.map((tx) => String(tx.id)).sort();
  return createHash('sha256')
    .update(`${portfolioId}|${transactions.length}|${ids.join(',')}`, 'utf8')
    .digest('hex');
}

function defaultExternalId(
  type: string,
  assetId: string,
  accountId: string,
  tradeDate: string,
  factor: string,
): string {
  return `MANUAL-CA|${type}|${assetId}|${accountId}|${tradeDate}|${factor}`;
}

interface BatchContext {
  accountId: string;
  tickers: Map<string, string>;
  ledger: Transaction[];
}

@Injectable()
export class CorporateActionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async preview(command: CorporateActionBatchCommand): Promise<PreviewCorporateActionsResult> {
    const ctx = await this.loadContext(command);
    const staged = this.buildStagedTransactions(command, new Date());
    let projection: ReturnType<typeof replayPortfolio>;
    try {
      projection = replayPortfolio({
        portfolioId: command.portfolioId,
        transactions: [...ctx.ledger, ...staged],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao projetar eventos';
      return {
        legs: staged.map((_tx, index) =>
          this.previewLeg(index, command.legs[index]!, ctx, 'INVALID', message, null),
        ),
        projectedQuantities: [],
        costBasisStatus: 'INCOMPLETE',
        taxMessage: CORPORATE_ACTION_TAX_MESSAGE,
        ledgerFingerprint: ledgerFingerprint(command.portfolioId, ctx.ledger),
        readyCount: 0,
      };
    }
    const auditByTxId = new Map(
      projection.state.appliedCorporateActions.map((ca) => [String(ca.transactionId), ca]),
    );
    const legs: CorporateActionLegPreview[] = staged.map((tx, index) => {
      const input = command.legs[index]!;
      if (this.findDuplicate(input, ctx)) {
        return this.previewLeg(
          index,
          input,
          ctx,
          'DUPLICATE',
          'Evento idêntico já existe no livro-razão',
          null,
        );
      }
      const ca = auditByTxId.get(String(tx.id));
      if (!ca) {
        return this.previewLeg(
          index,
          input,
          ctx,
          'INVALID',
          'Evento não aplicado na projeção',
          null,
        );
      }
      const afterQty = ca.afterQuantity.value;
      const fractionWarning =
        tx.type === 'REVERSE_SPLIT' && afterQty.includes('.')
          ? 'A operação gera quantidade fracionária. Verifique o tratamento oficial da fração antes de confirmar.'
          : null;
      return this.previewLeg(index, input, ctx, 'READY', null, {
        beforeQuantity: ca.beforeQuantity.value,
        afterQuantity: afterQty,
        costBasisStatus: ca.status,
        fractionWarning,
      });
    });
    // Sequential chain: the running position per asset walks the staged legs
    // in explicit order (never recomputed independently from start).
    const running = new Map<string, { before: string | null; after: string }>();
    for (const leg of legs) {
      if (leg.status !== 'READY' || !leg.beforeQuantity || !leg.afterQuantity) continue;
      const prev = running.get(leg.assetId);
      running.set(leg.assetId, {
        before: prev?.before ?? leg.beforeQuantity,
        after: leg.afterQuantity,
      });
    }
    let costBasisStatus: 'KNOWN' | 'INCOMPLETE' = 'KNOWN';
    for (const leg of legs) {
      if (leg.status === 'READY' && leg.costBasisStatus === 'INCOMPLETE') {
        costBasisStatus = 'INCOMPLETE';
        break;
      }
    }
    return {
      legs,
      projectedQuantities: [...running.entries()].map(([assetId, q]) => ({
        assetId,
        assetTicker: ctx.tickers.get(assetId) ?? null,
        beforeQuantity: q.before,
        afterQuantity: q.after,
      })),
      costBasisStatus,
      taxMessage: CORPORATE_ACTION_TAX_MESSAGE,
      ledgerFingerprint: ledgerFingerprint(command.portfolioId, ctx.ledger),
      readyCount: legs.filter((leg) => leg.status === 'READY').length,
    };
  }

  async confirm(command: ConfirmCorporateActionsCommand): Promise<Transaction[]> {
    const ctx = await this.loadContext(command);
    if (ledgerFingerprint(command.portfolioId, ctx.ledger) !== command.expectedLedgerFingerprint) {
      throw new ConflictException({
        message:
          'A carteira mudou desde a pré-visualização. Gere uma nova pré-visualização antes de confirmar.',
        code: 'CORPORATE_ACTION.STALE_PREVIEW',
      });
    }
    const staged = this.buildStagedTransactions(command, new Date());
    for (const [index, tx] of staged.entries()) {
      const input = command.legs[index]!;
      if (this.findDuplicate(input, ctx)) {
        throw new ConflictException({
          message: `Evento ${index + 1} já existe no livro-razão (duplicado exato).`,
          code: 'CORPORATE_ACTION.EXACT_DUPLICATE',
        });
      }
      void tx;
    }
    // Dry-run backstop: every engine-level invariant (non-empty position,
    // factor rules, currency agreement) must hold or nothing is written.
    // Failures surface as 422 via the global replay-error mapping.
    replayPortfolio({ portfolioId: command.portfolioId, transactions: [...ctx.ledger, ...staged] });
    // Single atomic write: either every leg lands or none does.
    return this.transactionRepository.createMany(staged);
  }

  private previewLeg(
    index: number,
    input: CorporateActionLegInput,
    ctx: BatchContext,
    status: CorporateActionLegPreview['status'],
    message: string | null,
    effect: {
      beforeQuantity: string;
      afterQuantity: string;
      costBasisStatus: 'KNOWN' | 'INCOMPLETE';
      fractionWarning: string | null;
    } | null,
  ): CorporateActionLegPreview {
    return {
      index,
      assetId: input.assetId,
      assetTicker: ctx.tickers.get(input.assetId) ?? null,
      type: input.type,
      tradeDate: input.tradeDate,
      factor: input.factor,
      status,
      message,
      beforeQuantity: effect?.beforeQuantity ?? null,
      afterQuantity: effect?.afterQuantity ?? null,
      costBasisStatus: effect?.costBasisStatus ?? null,
      fractionWarning: effect?.fractionWarning ?? null,
    };
  }

  private findDuplicate(input: CorporateActionLegInput, ctx: BatchContext): Transaction | null {
    return (
      ctx.ledger.find(
        (tx) =>
          tx.type === input.type &&
          String(tx.accountId) === ctx.accountId &&
          'assetId' in tx &&
          String((tx as { assetId: unknown }).assetId) === input.assetId &&
          tx.tradeDate.toString() === input.tradeDate &&
          'factor' in tx &&
          normalizeDecimalValue((tx as { factor: { value: string } }).factor.value) ===
            normalizeDecimalValue(input.factor),
      ) ?? null
    );
  }

  private buildStagedTransactions(
    command: CorporateActionBatchCommand,
    baseCreatedAt: Date,
  ): Transaction[] {
    if (command.legs.length === 0) {
      throw new InvalidTransactionError('At least one corporate-action event is required');
    }
    if (command.legs.length > 20) {
      throw new InvalidTransactionError('At most 20 corporate-action events per confirmation');
    }
    // Deterministic staged order on same dates: +1ms per leg (rectification
    // precedent). Canonical replay sorts by (tradeDate, createdAt, id), so
    // the owner-staged sequence is exactly the replay sequence.
    return command.legs.map((leg, index) => {
      if (!isManualCorporateActionType(leg.type)) {
        throw new InvalidTransactionError(
          `Unsupported manual corporate-action type '${leg.type}'. Only SPLIT and REVERSE_SPLIT are supported.`,
        );
      }
      const tradeDate = LocalDate.from(leg.tradeDate);
      const factor = Quantity.from(leg.factor);
      if (!factor.isPositive()) {
        throw new InvalidTransactionError(
          `${leg.type} requires factor > 0, received '${factor.value}'`,
        );
      }
      if (factor.equals(Quantity.from('1'))) {
        throw new InvalidTransactionError(
          `${leg.type} factor cannot be 1 (no-op splits would poison future replays)`,
        );
      }
      const notes = (leg.notes ?? '').trim();
      if (notes.length === 0) {
        throw new InvalidTransactionError(
          'Evidence notes are required for manual corporate-action events',
        );
      }
      if (notes.length > 1000) {
        throw new InvalidTransactionError('Evidence notes must be at most 1000 characters');
      }
      return TransactionFactory.createSplit({
        id: randomUUID(),
        portfolioId: command.portfolioId,
        accountId: command.accountId,
        assetId: leg.assetId,
        type: leg.type,
        factor,
        currency: command.currency,
        tradeDate: tradeDate.toString(),
        source: 'MANUAL',
        provider: 'MANUAL',
        externalId:
          leg.externalId?.trim() ||
          defaultExternalId(
            leg.type,
            leg.assetId,
            command.accountId,
            tradeDate.toString(),
            leg.factor,
          ),
        notes,
        createdAt: new Date(baseCreatedAt.getTime() + index),
      });
    });
  }

  private async loadContext(command: CorporateActionBatchCommand): Promise<BatchContext> {
    const portfolio = await this.portfolioRepository.findById(command.portfolioId);
    if (!portfolio || (command.userId && portfolio.userId !== command.userId)) {
      throw new EntityNotFoundError('Portfolio', command.portfolioId);
    }
    const account = await this.accountRepository.findById(command.accountId);
    if (!account) {
      throw new EntityNotFoundError('Account', command.accountId);
    }
    if (account.portfolioId !== command.portfolioId) {
      throw new CrossPortfolioIntegrityError(
        `Account '${command.accountId}' belongs to portfolio '${account.portfolioId}', not '${command.portfolioId}'`,
      );
    }
    const assetIds = [...new Set(command.legs.map((leg) => leg.assetId).filter(Boolean))];
    const assets = assetIds.length > 0 ? await this.assetRepository.findByIds(assetIds) : [];
    const found = new Set(assets.map((asset) => String(asset.id)));
    for (const leg of command.legs) {
      if (!leg.assetId || !found.has(leg.assetId)) {
        throw new EntityNotFoundError('Asset', leg.assetId || 'unknown');
      }
    }
    const tickers = new Map(assets.map((asset) => [String(asset.id), asset.ticker]));
    const ledger = await this.transactionRepository.findByPortfolioId(command.portfolioId);
    return { accountId: command.accountId, tickers, ledger };
  }
}
