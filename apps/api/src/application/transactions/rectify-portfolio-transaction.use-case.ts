import { Inject, Injectable } from '@nestjs/common';
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
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
  EntityNotFoundError,
  CrossPortfolioIntegrityError,
  DuplicateExternalTransactionError,
} from '@atlas/database';
import {
  TRANSACTION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';

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
  summary: string;
}

@Injectable()
export class RectifyPortfolioTransactionUseCase {
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

  async execute(
    command: RectifyPortfolioTransactionCommand,
  ): Promise<RectifyPortfolioTransactionResult> {
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

        return {
          originalTransactionId: originalTx.id,
          mode: command.mode,
          compensatingTransaction: existingReversal,
          replacementTransaction: existingReplacement,
          isIdempotentReplay: true,
          summary:
            command.mode === 'CANCEL'
              ? 'Operação de estorno já confirmada anteriormente (reexecução idempotente).'
              : 'Operação de retificação já confirmada anteriormente (reexecução idempotente).',
        };
      }
    }

    // 5. Prevent non-idempotent duplicate compensation for the same original transaction
    const portfolioTxs = await this.transactionRepository.findByPortfolioId(command.portfolioId);
    const alreadyCompensated = portfolioTxs.some(
      (t) =>
        t.notes?.includes(`[COMPENSAÇÃO ref ${originalTx.id}]`) &&
        (!command.idempotencyKey || t.externalId !== reversalExternalId),
    );
    if (alreadyCompensated) {
      throw new InvalidTransactionError(
        'Esta transação já foi estornada/retificada anteriormente.',
      );
    }

    // 6. Derive canonical compensating transaction (strictly append-only, opposite type)
    const compensatingType = originalTx.type === 'BUY' ? 'SELL' : 'BUY';
    const reasonClean = command.reason?.trim();
    const compensatingNotes = `[COMPENSAÇÃO ref ${originalTx.id}]${
      command.mode === 'CANCEL' ? ' Estorno cancelatório' : ' Estorno para retificação'
    }${reasonClean ? `: ${reasonClean}` : ''}`;

    const originalQtyStr = originalTx.quantity ? originalTx.quantity.value : '0';
    const originalPriceStr = originalTx.unitPrice ? originalTx.unitPrice.amount : '0';

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
      };

      const repType = rep.type || originalTx.type;
      replacementTx =
        repType === 'BUY'
          ? TransactionFactory.createBuy(commonReplacementProps)
          : TransactionFactory.createSell(commonReplacementProps);
    }

    // 8. Atomic persistence of compensating and replacement transactions in single DB transaction
    const toPersist: Transaction[] =
      command.mode === 'CANCEL' ? [compensatingTx] : [compensatingTx, replacementTx!];

    try {
      const persisted = await this.transactionRepository.createMany(toPersist);

      return {
        originalTransactionId: originalTx.id,
        mode: command.mode,
        compensatingTransaction: persisted[0]!,
        replacementTransaction: persisted[1] ?? null,
        isIdempotentReplay: false,
        summary:
          command.mode === 'CANCEL'
            ? 'Transação estornada com sucesso no ledger.'
            : 'Transação retificada com sucesso: estorno e nova operação registradas no ledger.',
      };
    } catch (error) {
      // If concurrent request succeeded with same idempotency key, return existing
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

          return {
            originalTransactionId: originalTx.id,
            mode: command.mode,
            compensatingTransaction: reversal,
            replacementTransaction: replacement,
            isIdempotentReplay: true,
            summary:
              command.mode === 'CANCEL'
                ? 'Operação de estorno já confirmada anteriormente (reexecução idempotente).'
                : 'Operação de retificação já confirmada anteriormente (reexecução idempotente).',
          };
        }
      }
      throw error;
    }
  }
}
