import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  Transaction,
  TransactionFactory,
  TransactionType,
  InvalidTransactionError,
  Quantity,
  Money,
  LocalDate,
} from '@atlas/domain';
import {
  ITransactionRepository,
  ITransactionRectificationRepository,
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
  EntityNotFoundError,
  CrossPortfolioIntegrityError,
  DuplicateExternalTransactionError,
} from '@atlas/database';
import {
  TRANSACTION_REPOSITORY,
  TRANSACTION_RECTIFICATION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import { isEquivalentReplacement } from '@atlas/portfolio-strategy';

export interface RectifyTransactionReplacementCommand {
  type?: TransactionType;
  accountId?: string;
  assetId?: string;
  quantity: string;
  unitPrice: string;
  fees?: string;
  tradeDate: string;
  notes?: string;
}

export interface RectifyPortfolioTransactionCommand {
  portfolioId: string;
  originalTransactionId: string;
  mode: 'RECTIFY' | 'CANCEL';
  reason?: string;
  idempotencyKey?: string;
  replacement?: RectifyTransactionReplacementCommand;
  userId: string;
}

export interface RectifyPortfolioTransactionResult {
  originalTransactionId: string;
  mode: 'RECTIFY' | 'CANCEL';
  compensatingTransaction: Transaction;
  replacementTransaction: Transaction | null;
  isIdempotentReplay: boolean;
  rectificationId: string | null;
  effectiveTransactionId: string | null;
  summary: string;
}

@Injectable()
export class RectifyPortfolioTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(TRANSACTION_RECTIFICATION_REPOSITORY)
    private readonly rectifications: ITransactionRectificationRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(
    command: RectifyPortfolioTransactionCommand,
  ): Promise<RectifyPortfolioTransactionResult> {
    const decidedAt = new Date();
    const reason = command.reason?.trim() ?? '';
    if (reason === '') {
      throw new InvalidTransactionError('A reason is required to rectify a transaction.');
    }
    if (reason.length > 500) {
      throw new InvalidTransactionError('Reason must be at most 500 characters.');
    }

    // 1. Anti-enumeration: Verify portfolio ownership
    const portfolio = await this.portfolioRepository.findById(command.portfolioId);
    if (!portfolio || portfolio.userId !== command.userId) {
      throw new EntityNotFoundError('Transaction', command.originalTransactionId);
    }

    // 2. Anti-enumeration: Verify original transaction belongs to portfolio
    const originalTx = await this.transactionRepository.findById(command.originalTransactionId);
    if (!originalTx || originalTx.portfolioId !== command.portfolioId) {
      throw new EntityNotFoundError('Transaction', command.originalTransactionId);
    }

    // 3. Verify eligibility
    if (originalTx.type !== 'BUY' && originalTx.type !== 'SELL') {
      throw new InvalidTransactionError(
        `Transaction type '${originalTx.type}' is not supported for automated rectification. Only BUY and SELL are supported.`,
      );
    }

    if (originalTx.notes?.includes('[COMPENSAÇÃO ref')) {
      throw new InvalidTransactionError('Compensating transactions cannot be rectified.');
    }

    // 4. Idempotency check: If an idempotency key was supplied, check if already executed
    const provider = 'ATLAS_RECTIFY';
    const reversalExternalId = command.idempotencyKey
      ? `reversal:${originalTx.id}:${command.idempotencyKey}`
      : `reversal:${originalTx.id}`;
    const replacementExternalId = command.idempotencyKey
      ? `replacement:${originalTx.id}:${command.idempotencyKey}`
      : `replacement:${originalTx.id}`;

    if (command.idempotencyKey) {
      const existingReversal = await this.transactionRepository.findByExternalId(
        command.portfolioId,
        provider,
        reversalExternalId,
      );

      if (existingReversal) {
        const existingReplacement =
          command.mode === 'RECTIFY'
            ? await this.transactionRepository.findByExternalId(
                command.portfolioId,
                provider,
                replacementExternalId,
              )
            : null;
        const existingLink = await this.rectifications.findByOriginalTransactionId(
          originalTx.id,
          command.portfolioId,
        );

        return {
          originalTransactionId: originalTx.id,
          mode: command.mode,
          compensatingTransaction: existingReversal,
          replacementTransaction: existingReplacement,
          isIdempotentReplay: true,
          rectificationId: existingLink?.id ?? null,
          effectiveTransactionId:
            existingLink?.replacementTransactionId !== null &&
            existingLink?.replacementTransactionId !== undefined
              ? await this.resolveEffectiveTransactionId(command.portfolioId, originalTx.id)
              : null,
          summary:
            command.mode === 'CANCEL'
              ? 'Operação de estorno já confirmada anteriormente (reexecução idempotente).'
              : 'Operação de retificação já confirmada anteriormente (reexecução idempotente).',
        };
      }
    }

    // 5. Already rectified (append-only link table): one outgoing rectification
    // per original. Legacy notes-marked rectifications fall back to
    // external-id resolution below so old data stays navigable.
    const existingLink = await this.rectifications.findByOriginalTransactionId(
      originalTx.id,
      command.portfolioId,
    );
    if (existingLink) {
      throw new ConflictException({
        message: 'Transaction has already been rectified.',
        code: 'TRANSACTION.ALREADY_RECTIFIED',
        effectiveTransactionId: await this.resolveEffectiveTransactionId(
          command.portfolioId,
          originalTx.id,
        ),
      });
    }

    // 6. Prevent non-idempotent duplicate compensation for the same original transaction.
    // New append-only link rows are checked first (3b); this legacy
    // notes scan covers rectifications recorded before link rows existed.
    const portfolioTxs = await this.transactionRepository.findByPortfolioId(command.portfolioId);
    const alreadyCompensated = portfolioTxs.some(
      (t) =>
        t.notes?.includes(`[COMPENSAÇÃO ref ${originalTx.id}]`) &&
        (!command.idempotencyKey || t.externalId !== reversalExternalId),
    );
    if (alreadyCompensated) {
      throw new ConflictException({
        message: 'Transaction has already been rectified.',
        code: 'TRANSACTION.ALREADY_RECTIFIED',
        effectiveTransactionId: await this.resolveEffectiveTransactionId(
          command.portfolioId,
          originalTx.id,
        ),
      });
    }

    // 6. Derive canonical compensating transaction (strictly append-only, opposite type)
    const compensatingType = originalTx.type === 'BUY' ? 'SELL' : 'BUY';
    const reasonClean = reason;
    const compensatingNotes = `[COMPENSAÇÃO ref ${originalTx.id}]${
      command.mode === 'CANCEL' ? ' Estorno cancelatório' : ' Estorno para retificação'
    }${reasonClean ? `: ${reasonClean}` : ''}`;

    const originalQtyStr = originalTx.quantity ? originalTx.quantity.value : '0';
    const originalPriceStr = originalTx.unitPrice ? originalTx.unitPrice.amount : '0';

    // Canonical replay orders by (tradeDate, createdAt, id). The compensating
    // leg must always sort before the replacement leg, otherwise a same-day
    // BUY/SELL pair can be replayed in the wrong order (e.g. replacement BUY
    // before the reversal SELL) and corrupt the derived average cost. Timestamps
    // are technical audit metadata; financial semantics are unchanged.
    const rectificationCreatedAt = new Date();
    const replacementCreatedAt = new Date(rectificationCreatedAt.getTime() + 1);

    const commonCompensatingProps = {
      portfolioId: originalTx.portfolioId,
      accountId: originalTx.accountId,
      assetId: originalTx.assetId!,
      quantity: originalQtyStr,
      unitPrice: originalPriceStr,
      fees: '0',
      taxes: '0',
      currency: originalTx.currency,
      tradeDate: originalTx.tradeDate.toString(),
      settlementDate: originalTx.settlementDate ? originalTx.settlementDate.toString() : undefined,
      source: 'MANUAL',
      provider,
      externalId: reversalExternalId,
      notes: compensatingNotes,
      createdAt: rectificationCreatedAt,
    };

    const compensatingTx =
      compensatingType === 'BUY'
        ? TransactionFactory.createBuy(commonCompensatingProps)
        : TransactionFactory.createSell(commonCompensatingProps);

    // 7. If mode === 'RECTIFY', derive canonical replacement transaction
    let replacementTx: Transaction | null = null;
    if (command.mode === 'RECTIFY') {
      if (!command.replacement) {
        throw new InvalidTransactionError('Replacement fields are required for RECTIFY mode.');
      }

      const rep = command.replacement;
      const targetAccountId = rep.accountId || originalTx.accountId;
      const targetAssetId = rep.assetId || originalTx.assetId!;

      // Validate account
      const account = await this.accountRepository.findById(targetAccountId);
      if (!account) {
        throw new EntityNotFoundError('Account', targetAccountId);
      }
      if (account.portfolioId !== command.portfolioId) {
        throw new CrossPortfolioIntegrityError(
          `Account '${targetAccountId}' belongs to portfolio '${account.portfolioId}', not '${command.portfolioId}'`,
        );
      }

      // Validate asset
      const asset = await this.assetRepository.findById(targetAssetId);
      if (!asset) {
        throw new EntityNotFoundError('Asset', targetAssetId);
      }

      // Validate replacement fields using domain primitives
      const repQty = Quantity.from(rep.quantity);
      if (!repQty.isPositive()) {
        throw new InvalidTransactionError('Replacement quantity must be positive.');
      }

      const repPrice = Money.from(rep.unitPrice, originalTx.currency);
      if (repPrice.isNegative()) {
        throw new InvalidTransactionError('Replacement unit price must be non-negative.');
      }

      if (rep.fees) {
        const repFees = Money.from(rep.fees, originalTx.currency);
        if (repFees.isNegative()) {
          throw new InvalidTransactionError('Replacement fees cannot be negative.');
        }
      }

      // Validate trade date
      LocalDate.from(rep.tradeDate);

      const replacementNotes = `[CORREÇÃO ref ${originalTx.id}]${
        reasonClean ? ` ${reasonClean}` : ''
      }${rep.notes?.trim() ? ` — ${rep.notes.trim()}` : ''}`;

      const commonReplacementProps = {
        portfolioId: originalTx.portfolioId,
        accountId: targetAccountId,
        assetId: targetAssetId,
        quantity: rep.quantity,
        unitPrice: rep.unitPrice,
        fees: rep.fees || '0',
        taxes: '0',
        currency: originalTx.currency,
        tradeDate: rep.tradeDate,
        source: 'MANUAL',
        provider,
        externalId: replacementExternalId,
        notes: replacementNotes,
        createdAt: replacementCreatedAt,
      };

      const repType = rep.type || originalTx.type;
      replacementTx =
        repType === 'BUY'
          ? TransactionFactory.createBuy(commonReplacementProps)
          : TransactionFactory.createSell(commonReplacementProps);

      // No-change guard: a replacement identical to the original in every
      // canonical field is rejected before writing anything.
      const originalTrade = originalTx as unknown as {
        quantity?: { value?: string };
        unitPrice?: { amount?: string };
        fees?: { amount?: string };
        taxes?: { amount?: string };
        assetId?: { toString(): string };
      };
      const equivalent = isEquivalentReplacement(
        {
          type: originalTx.type,
          tradeDate: originalTx.tradeDate.toString(),
          assetId: originalTx.assetId ?? null,
          accountId: originalTx.accountId,
          quantity: originalTrade.quantity?.value ?? null,
          unitPrice: originalTrade.unitPrice?.amount ?? null,
          fees: originalTrade.fees?.amount ?? null,
          taxes: originalTrade.taxes?.amount ?? null,
          currency: originalTx.currency,
        },
        {
          type: repType,
          tradeDate: rep.tradeDate,
          assetId: targetAssetId,
          accountId: targetAccountId,
          quantity: rep.quantity,
          unitPrice: rep.unitPrice,
          fees: rep.fees ?? '0',
          taxes: '0',
          currency: originalTx.currency,
        },
      );
      if (equivalent) {
        throw new InvalidTransactionError(
          'Replacement is identical to the original transaction. Nothing to rectify.',
        );
      }
    }

    // 8. Atomic persistence of compensating + replacement transactions and
    // the rectification link in a single DB transaction. Either everything
    // lands or nothing does — no orphan legs, no link-less rectifications.
    const toPersist: Transaction[] =
      command.mode === 'CANCEL' ? [compensatingTx] : [compensatingTx, replacementTx!];

    try {
      const created = await this.rectifications.createWithTransactions({
        transactions: toPersist,
        link: {
          portfolioId: command.portfolioId,
          originalTransactionId: originalTx.id,
          compensatingTransactionId: toPersist[0]!.id,
          replacementTransactionId: command.mode === 'CANCEL' ? null : (toPersist[1]?.id ?? null),
          mode: command.mode,
          reason,
          decidedByPrincipal: command.userId,
          decidedAt,
        },
      });

      return {
        originalTransactionId: originalTx.id,
        mode: command.mode,
        compensatingTransaction: created.transactions[0]!,
        replacementTransaction: created.transactions[1] ?? null,
        isIdempotentReplay: false,
        rectificationId: created.record.id,
        effectiveTransactionId: created.record.replacementTransactionId,
        summary:
          command.mode === 'CANCEL'
            ? 'Transação estornada com sucesso no ledger.'
            : 'Transação retificada com sucesso: estorno e nova operação registradas no ledger.',
      };
    } catch (error) {
      // Concurrent winner with the same idempotency key: return existing.
      if (error instanceof DuplicateExternalTransactionError && command.idempotencyKey) {
        const reversal = await this.transactionRepository.findByExternalId(
          command.portfolioId,
          provider,
          reversalExternalId,
        );
        if (reversal) {
          const replacement =
            command.mode === 'RECTIFY'
              ? await this.transactionRepository.findByExternalId(
                  command.portfolioId,
                  provider,
                  replacementExternalId,
                )
              : null;
          const existingLink = await this.rectifications.findByOriginalTransactionId(
            originalTx.id,
            command.portfolioId,
          );

          return {
            originalTransactionId: originalTx.id,
            mode: command.mode,
            compensatingTransaction: reversal,
            replacementTransaction: replacement,
            isIdempotentReplay: true,
            rectificationId: existingLink?.id ?? null,
            effectiveTransactionId: existingLink?.replacementTransactionId ?? null,
            summary:
              command.mode === 'CANCEL'
                ? 'Operação de estorno já confirmada anteriormente (reexecução idempotente).'
                : 'Operação de retificação já confirmada anteriormente (reexecução idempotente).',
          };
        }
      }
      // Any concurrent winner (same key without a clean read, different key,
      // or raw unique violation): if a link row now exists for this original,
      // the race is settled — report the conflict with the effective target
      // instead of a generic persistence error.
      const raced = await this.rectifications.findByOriginalTransactionId(
        originalTx.id,
        command.portfolioId,
      );
      if (raced) {
        throw new ConflictException({
          message: 'Transaction has already been rectified.',
          code: 'TRANSACTION.ALREADY_RECTIFIED',
          effectiveTransactionId: raced.replacementTransactionId,
        });
      }
      throw error;
    }
  }

  /**
   * Effective transaction for an already-rectified original, following
   * the append-only chain (A → B → C resolves to C). Delegates to the
   * repository, which covers link rows and legacy notes-marked
   * rectifications. Cycles are impossible by construction.
   */
  async resolveEffectiveTransactionId(
    portfolioId: string,
    originalTransactionId: string,
  ): Promise<string | null> {
    return this.rectifications.resolveEffectiveTransactionId(originalTransactionId, portfolioId);
  }
}
