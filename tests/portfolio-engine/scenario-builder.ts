import {
  Transaction,
  TransactionFactory,
  LocalDate,
  PortfolioId,
  AccountId,
  AssetId,
} from '@atlas/domain';
import {
  PortfolioReplayEngine,
  ReplayResult,
  createPortfolioReplayEngine,
} from '@atlas/portfolio-engine';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4 } from './fixtures/assets';

let txSequence = 1;

function nextTxId(): string {
  const seq = (txSequence++).toString().padStart(12, '0');
  return `f0000000-0000-4000-8000-${seq}`;
}

export class PortfolioScenarioBuilder {
  private readonly portfolioId: PortfolioId;
  private readonly defaultAccountId: AccountId;
  private readonly transactions: Transaction[] = [];
  private asOfDate?: LocalDate;

  constructor(
    portfolioId: PortfolioId = PORTFOLIO_DEFAULT,
    defaultAccountId: AccountId = ACCOUNT_XP,
  ) {
    this.portfolioId = portfolioId;
    this.defaultAccountId = defaultAccountId;
  }

  buy(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    unitPrice?: string | number;
    currency?: string;
    fees?: string | number;
    taxes?: string | number;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createBuy({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      quantity: props.quantity.toString(),
      unitPrice: (props.unitPrice ?? '10.00').toString(),
      currency: props.currency ?? 'BRL',
      fees: props.fees !== undefined ? props.fees.toString() : undefined,
      taxes: props.taxes !== undefined ? props.taxes.toString() : undefined,
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  sell(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    unitPrice?: string | number;
    currency?: string;
    fees?: string | number;
    taxes?: string | number;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createSell({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      quantity: props.quantity.toString(),
      unitPrice: (props.unitPrice ?? '10.00').toString(),
      currency: props.currency ?? 'BRL',
      fees: props.fees !== undefined ? props.fees.toString() : undefined,
      taxes: props.taxes !== undefined ? props.taxes.toString() : undefined,
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  transferIn(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createTransfer({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      type: 'TRANSFER_IN',
      quantity: props.quantity.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  transferOut(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createTransfer({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      type: 'TRANSFER_OUT',
      quantity: props.quantity.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  dividend(props: {
    assetId?: AssetId | string;
    amount: string | number;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createIncome({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      type: 'DIVIDEND',
      amount: props.amount.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  split(props: {
    assetId?: AssetId | string;
    factor: string | number;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createSplit({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      type: 'SPLIT',
      factor: props.factor.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  fee(props: {
    amount: string | number;
    tradeDate: string | LocalDate;
    assetId?: AssetId | string;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createExpense({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: props.assetId ? String(props.assetId) : undefined,
      type: 'FEE',
      amount: props.amount.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  tax(props: {
    amount: string | number;
    tradeDate: string | LocalDate;
    assetId?: AssetId | string;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createExpense({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: props.assetId ? String(props.assetId) : undefined,
      type: 'TAX',
      amount: props.amount.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  asOf(date: string | LocalDate): this {
    this.asOfDate = typeof date === 'string' ? LocalDate.from(date) : date;
    return this;
  }

  build(): Transaction[] {
    return [...this.transactions];
  }

  replay(engine: PortfolioReplayEngine = createPortfolioReplayEngine()): ReplayResult {
    return engine.replay({
      portfolioId: this.portfolioId,
      transactions: this.transactions,
      asOfDate: this.asOfDate,
    });
  }
}

export const scenario = (
  portfolioId?: PortfolioId,
  defaultAccountId?: AccountId,
): PortfolioScenarioBuilder => new PortfolioScenarioBuilder(portfolioId, defaultAccountId);
