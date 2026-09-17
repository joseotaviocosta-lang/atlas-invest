import { Inject, Injectable } from '@nestjs/common';
import {
  Transaction,
  TransactionFactory,
  TransactionType,
  TransactionSource,
  InvalidTransactionError,
} from '@atlas/domain';
import {
  ITransactionRepository,
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
  EntityNotFoundError,
  CrossPortfolioIntegrityError,
} from '@atlas/database';
import {
  TRANSACTION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';

export interface CreateTransactionCommand {
  portfolioId: string;
  accountId: string;
  type: TransactionType;
  currency: string;
  tradeDate: string;
  settlementDate?: string;
  source?: TransactionSource;
  provider?: string;
  externalId?: string;
  notes?: string;
  assetId?: string;
  quantity?: string;
  unitPrice?: string;
  fees?: string;
  taxes?: string;
  amount?: string;
  factor?: string;
  transferGroupId?: string;
  userId?: string;
}

@Injectable()
export class CreateTransactionUseCase {
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

  async execute(command: CreateTransactionCommand): Promise<Transaction> {
    const portfolio = await this.portfolioRepository.findById(command.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', command.portfolioId);
    }

    if (command.userId && portfolio.userId !== command.userId) {
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

    if (command.assetId) {
      const asset = await this.assetRepository.findById(command.assetId);
      if (!asset) {
        throw new EntityNotFoundError('Asset', command.assetId);
      }
    }

    const tx = this.buildTransaction(command);
    return this.transactionRepository.create(tx);
  }

  private buildTransaction(command: CreateTransactionCommand): Transaction {
    const common = {
      portfolioId: command.portfolioId,
      accountId: command.accountId,
      currency: command.currency,
      tradeDate: command.tradeDate,
      settlementDate: command.settlementDate,
      source: command.source,
      provider: command.provider,
      externalId: command.externalId,
      notes: command.notes,
    };

    switch (command.type) {
      case 'BUY': {
        if (!command.assetId || !command.quantity || !command.unitPrice) {
          throw new InvalidTransactionError('BUY requires assetId, quantity, and unitPrice');
        }
        return TransactionFactory.createBuy({
          ...common,
          assetId: command.assetId,
          quantity: command.quantity,
          unitPrice: command.unitPrice,
          fees: command.fees,
          taxes: command.taxes,
        });
      }

      case 'SELL': {
        if (!command.assetId || !command.quantity || !command.unitPrice) {
          throw new InvalidTransactionError('SELL requires assetId, quantity, and unitPrice');
        }
        return TransactionFactory.createSell({
          ...common,
          assetId: command.assetId,
          quantity: command.quantity,
          unitPrice: command.unitPrice,
          fees: command.fees,
          taxes: command.taxes,
        });
      }

      case 'DIVIDEND':
      case 'JCP':
      case 'FII_INCOME': {
        if (!command.assetId || !command.amount) {
          throw new InvalidTransactionError(`${command.type} requires assetId and amount`);
        }
        return TransactionFactory.createIncome({
          ...common,
          type: command.type,
          assetId: command.assetId,
          amount: command.amount,
        });
      }

      case 'SPLIT':
      case 'REVERSE_SPLIT': {
        if (!command.assetId || !command.factor) {
          throw new InvalidTransactionError(`${command.type} requires assetId and factor`);
        }
        return TransactionFactory.createSplit({
          ...common,
          type: command.type,
          assetId: command.assetId,
          factor: command.factor,
        });
      }

      case 'BONUS': {
        if (!command.assetId || !command.quantity) {
          throw new InvalidTransactionError('BONUS requires assetId and quantity');
        }
        return TransactionFactory.createBonus({
          ...common,
          assetId: command.assetId,
          quantity: command.quantity,
        });
      }

      case 'SUBSCRIPTION': {
        if (!command.assetId || !command.quantity || !command.unitPrice) {
          throw new InvalidTransactionError(
            'SUBSCRIPTION requires assetId, quantity, and unitPrice',
          );
        }
        return TransactionFactory.createSubscription({
          ...common,
          assetId: command.assetId,
          quantity: command.quantity,
          unitPrice: command.unitPrice,
        });
      }

      case 'AMORTIZATION': {
        if (!command.assetId || !command.amount) {
          throw new InvalidTransactionError('AMORTIZATION requires assetId and amount');
        }
        return TransactionFactory.createAmortization({
          ...common,
          assetId: command.assetId,
          amount: command.amount,
        });
      }

      case 'TRANSFER_IN':
      case 'TRANSFER_OUT': {
        if (!command.assetId || !command.quantity) {
          throw new InvalidTransactionError(`${command.type} requires assetId and quantity`);
        }
        return TransactionFactory.createTransfer({
          ...common,
          type: command.type,
          assetId: command.assetId,
          quantity: command.quantity,
          transferGroupId: command.transferGroupId,
        });
      }

      case 'DEPOSIT':
      case 'WITHDRAWAL': {
        if (!command.amount) {
          throw new InvalidTransactionError(`${command.type} requires amount`);
        }
        return TransactionFactory.createCashMovement({
          ...common,
          type: command.type,
          amount: command.amount,
        });
      }

      case 'FEE':
      case 'TAX': {
        if (!command.amount) {
          throw new InvalidTransactionError(`${command.type} requires amount`);
        }
        return TransactionFactory.createExpense({
          ...common,
          type: command.type,
          amount: command.amount,
          assetId: command.assetId,
        });
      }

      default: {
        throw new InvalidTransactionError(`Unsupported transaction type '${command.type}'`);
      }
    }
  }
}
