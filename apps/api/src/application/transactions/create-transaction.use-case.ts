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
    const [transaction] = await this.executeMany([command]);
    if (!transaction) {
      throw new InvalidTransactionError('Transaction creation returned no result');
    }
    return transaction;
  }

  async executeMany(commands: readonly CreateTransactionCommand[]): Promise<Transaction[]> {
    if (commands.length === 0) return [];

    const portfolioIds = new Set(commands.map((command) => command.portfolioId));
    if (portfolioIds.size !== 1) {
      throw new InvalidTransactionError('A transaction batch must target one portfolio');
    }

    const portfolioId = commands[0]!.portfolioId;
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }

    if (commands.some((command) => command.userId && portfolio.userId !== command.userId)) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }

    const accounts = await this.accountRepository.findByPortfolioId(portfolioId);
    const accountsById = new Map<string, (typeof accounts)[number]>(
      accounts.map((account) => [account.id, account]),
    );
    for (const command of commands) {
      const account = accountsById.get(command.accountId);
      if (!account) {
        const existingAccount = await this.accountRepository.findById(command.accountId);
        if (existingAccount) {
          throw new CrossPortfolioIntegrityError(
            `Account '${command.accountId}' belongs to portfolio '${existingAccount.portfolioId}', not '${portfolioId}'`,
          );
        }
        throw new EntityNotFoundError('Account', command.accountId);
      }

      if (account.portfolioId !== portfolioId) {
        throw new CrossPortfolioIntegrityError(
          `Account '${command.accountId}' belongs to portfolio '${account.portfolioId}', not '${portfolioId}'`,
        );
      }
    }

    const assetIds = [
      ...new Set(commands.flatMap((command) => (command.assetId ? [command.assetId] : []))),
    ];
    const assetsById = new Set<string>(
      (await this.assetRepository.findByIds(assetIds)).map((asset) => asset.id),
    );
    for (const command of commands) {
      if (command.assetId && !assetsById.has(command.assetId)) {
        throw new EntityNotFoundError('Asset', command.assetId);
      }
    }

    return this.transactionRepository.createMany(
      commands.map((command) => this.buildTransaction(command)),
    );
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
