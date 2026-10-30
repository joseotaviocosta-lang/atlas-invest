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
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4, ASSET_HGLG11 } from './fixtures/assets';

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
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    transferGroupId?: string;
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
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      transferGroupId: props.transferGroupId,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  transferOut(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    transferGroupId?: string;
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
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      transferGroupId: props.transferGroupId,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  receiptConversion(props: {
    assetId?: AssetId | string;
    targetAssetId?: AssetId | string;
    quantity: string | number;
    targetQuantity?: string | number;
    conversionRatio?: string | number;
    conversionType?: string;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const qty = props.quantity.toString();
    const ratio = (props.conversionRatio ?? '1').toString();
    const tx = TransactionFactory.createReceiptConversion({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      targetAssetId: String(props.targetAssetId ?? ASSET_HGLG11),
      quantity: qty,
      targetQuantity: (props.targetQuantity ?? qty).toString(),
      conversionRatio: ratio,
      conversionType: props.conversionType ?? 'SUBSCRIPTION_RECEIPT',
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  transfer(props: {
    fromAccountId: AccountId | string;
    toAccountId: AccountId | string;
    assetId?: AssetId | string;
    quantity: string | number;
    transferGroupId?: string;
    tradeDate?: string | LocalDate;
    outTradeDate?: string | LocalDate;
    inTradeDate?: string | LocalDate;
    currency?: string;
    outCreatedAt?: Date;
    inCreatedAt?: Date;
    outId?: string;
    inId?: string;
  }): this {
    const transferGroupId = props.transferGroupId ?? `grp-${nextTxId()}`;
    const outTradeDate = props.outTradeDate ?? props.tradeDate ?? '2026-01-15';
    const inTradeDate = props.inTradeDate ?? props.tradeDate ?? outTradeDate;
    const currency = props.currency ?? 'BRL';
    const assetId = props.assetId ?? ASSET_PETR4;

    this.transferOut({
      id: props.outId,
      accountId: props.fromAccountId,
      assetId,
      quantity: props.quantity,
      currency,
      tradeDate: outTradeDate,
      transferGroupId,
      createdAt: props.outCreatedAt,
    });

    this.transferIn({
      id: props.inId,
      accountId: props.toAccountId,
      assetId,
      quantity: props.quantity,
      currency,
      tradeDate: inTradeDate,
      transferGroupId,
      createdAt: props.inCreatedAt,
    });

    return this;
  }

  dividend(props: {
    assetId?: AssetId | string;
    amount: string | number;
    currency?: string;
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
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  jcp(props: {
    assetId?: AssetId | string;
    amount: string | number;
    currency?: string;
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
      type: 'JCP',
      amount: props.amount.toString(),
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  fiiIncome(props: {
    assetId?: AssetId | string;
    amount: string | number;
    currency?: string;
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
      type: 'FII_INCOME',
      amount: props.amount.toString(),
      currency: props.currency ?? 'BRL',
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

  reverseSplit(props: {
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
      type: 'REVERSE_SPLIT',
      factor: props.factor.toString(),
      currency: 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  bonus(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    assignedCost?: string | number;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createBonus({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      quantity: props.quantity.toString(),
      assignedCost: props.assignedCost !== undefined ? props.assignedCost.toString() : undefined,
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  amortization(props: {
    assetId?: AssetId | string;
    amount: string | number;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createAmortization({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      amount: props.amount.toString(),
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  fee(props: {
    amount: string | number;
    currency?: string;
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
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  tax(props: {
    amount: string | number;
    currency?: string;
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
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  subscription(props: {
    assetId?: AssetId | string;
    quantity: string | number;
    unitPrice: string | number;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createSubscription({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      assetId: String(props.assetId ?? ASSET_PETR4),
      quantity: props.quantity.toString(),
      unitPrice: props.unitPrice.toString(),
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  deposit(props: {
    amount: string | number;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createCashMovement({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      type: 'DEPOSIT',
      amount: props.amount.toString(),
      currency: props.currency ?? 'BRL',
      tradeDate: props.tradeDate,
      createdAt: props.createdAt,
    });
    this.transactions.push(tx);
    return this;
  }

  withdrawal(props: {
    amount: string | number;
    currency?: string;
    tradeDate: string | LocalDate;
    accountId?: AccountId | string;
    createdAt?: Date;
    id?: string;
  }): this {
    const tx = TransactionFactory.createCashMovement({
      id: props.id ?? nextTxId(),
      portfolioId: String(this.portfolioId),
      accountId: String(props.accountId ?? this.defaultAccountId),
      type: 'WITHDRAWAL',
      amount: props.amount.toString(),
      currency: props.currency ?? 'BRL',
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

  buildTransactions(): Transaction[] {
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
