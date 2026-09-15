import {
  TransactionId,
  PortfolioId,
  AccountId,
  AssetId,
  createTransactionId,
  createPortfolioId,
  createAccountId,
  createAssetId,
} from '../primitives/domain-id';
import { Currency, assertValidCurrency } from '../primitives/currency';
import { Money, MoneyJSON } from '../primitives/money';
import { Quantity } from '../primitives/quantity';
import { LocalDate } from '../primitives/local-date';
import { TransactionType, TransactionSource, TRANSACTION_SOURCES } from './types';
import { InvalidTransactionError } from '../errors/domain-error';

export interface BaseTransactionData {
  id: TransactionId;
  portfolioId: PortfolioId;
  accountId: AccountId;
  type: TransactionType;
  currency: Currency;
  tradeDate: LocalDate;
  settlementDate?: LocalDate;
  source: TransactionSource;
  provider?: string;
  externalId?: string;
  notes?: string;
  createdAt: Date;
}

export interface TradeTransaction extends BaseTransactionData {
  type: 'BUY' | 'SELL';
  assetId: AssetId;
  quantity: Quantity;
  unitPrice: Money;
  fees?: Money;
  taxes?: Money;
}

export interface IncomeTransaction extends BaseTransactionData {
  type: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
  assetId: AssetId;
  amount: Money;
}

export interface SplitTransaction extends BaseTransactionData {
  type: 'SPLIT' | 'REVERSE_SPLIT';
  assetId: AssetId;
  factor: Quantity;
}

export interface BonusTransaction extends BaseTransactionData {
  type: 'BONUS';
  assetId: AssetId;
  quantity: Quantity;
}

export interface SubscriptionTransaction extends BaseTransactionData {
  type: 'SUBSCRIPTION';
  assetId: AssetId;
  quantity: Quantity;
  unitPrice: Money;
}

export interface AmortizationTransaction extends BaseTransactionData {
  type: 'AMORTIZATION';
  assetId: AssetId;
  amount: Money;
}

export interface TransferTransaction extends BaseTransactionData {
  type: 'TRANSFER_IN' | 'TRANSFER_OUT';
  assetId: AssetId;
  quantity: Quantity;
}

export interface CashMovementTransaction extends BaseTransactionData {
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: Money;
}

export interface ExpenseTransaction extends BaseTransactionData {
  type: 'FEE' | 'TAX';
  amount: Money;
  assetId?: AssetId;
}

export type Transaction =
  | TradeTransaction
  | IncomeTransaction
  | SplitTransaction
  | BonusTransaction
  | SubscriptionTransaction
  | AmortizationTransaction
  | TransferTransaction
  | CashMovementTransaction
  | ExpenseTransaction;

export interface TransactionJSON {
  id: string;
  portfolioId: string;
  accountId: string;
  type: TransactionType;
  currency: string;
  tradeDate: string;
  settlementDate?: string;
  source: TransactionSource;
  provider?: string;
  externalId?: string;
  notes?: string;
  createdAt: string;
  assetId?: string;
  quantity?: string;
  unitPrice?: MoneyJSON;
  fees?: MoneyJSON;
  taxes?: MoneyJSON;
  amount?: MoneyJSON;
  factor?: string;
}

function validateSource(source: string): TransactionSource {
  if (!(TRANSACTION_SOURCES as readonly string[]).includes(source)) {
    throw new InvalidTransactionError(`Invalid transaction source '${source}'`);
  }
  return source as TransactionSource;
}

function parseLocalDate(input: string | LocalDate): LocalDate {
  return input instanceof LocalDate ? input : LocalDate.from(input);
}

export class TransactionFactory {
  private static parseCommon(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    currency: string;
    tradeDate: string | LocalDate;
    settlementDate?: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }) {
    const validCurrency = assertValidCurrency(props.currency);
    const validSource = validateSource(props.source ?? 'MANUAL');
    const tradeDate = parseLocalDate(props.tradeDate);
    const settlementDate = props.settlementDate ? parseLocalDate(props.settlementDate) : undefined;

    return {
      id: createTransactionId(props.id),
      portfolioId: createPortfolioId(props.portfolioId),
      accountId: createAccountId(props.accountId),
      currency: validCurrency,
      tradeDate,
      settlementDate,
      source: validSource,
      provider: props.provider?.trim(),
      externalId: props.externalId?.trim(),
      notes: props.notes?.trim(),
      createdAt: props.createdAt ?? new Date(),
    };
  }

  static createBuy(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    quantity: string | Quantity;
    unitPrice: string | Money;
    currency: string;
    fees?: string | Money;
    taxes?: string | Money;
    tradeDate: string | LocalDate;
    settlementDate?: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): TradeTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const quantity =
      props.quantity instanceof Quantity ? props.quantity : Quantity.from(props.quantity);
    const unitPrice =
      props.unitPrice instanceof Money
        ? props.unitPrice
        : Money.from(props.unitPrice, common.currency);

    if (!quantity.isPositive()) {
      throw new InvalidTransactionError(
        `BUY transaction requires positive quantity, received '${quantity.value}'`,
      );
    }
    if (unitPrice.isNegative()) {
      throw new InvalidTransactionError(
        `BUY transaction requires unitPrice >= 0, received '${unitPrice.amount}'`,
      );
    }

    const fees = props.fees
      ? props.fees instanceof Money
        ? props.fees
        : Money.from(props.fees, common.currency)
      : undefined;
    const taxes = props.taxes
      ? props.taxes instanceof Money
        ? props.taxes
        : Money.from(props.taxes, common.currency)
      : undefined;

    if (fees && fees.isNegative()) {
      throw new InvalidTransactionError('Fees must have a positive magnitude');
    }
    if (taxes && taxes.isNegative()) {
      throw new InvalidTransactionError('Taxes must have a positive magnitude');
    }

    const tx: TradeTransaction = {
      ...common,
      type: 'BUY',
      assetId,
      quantity,
      unitPrice,
      fees,
      taxes,
    };
    return Object.freeze(tx);
  }

  static createSell(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    quantity: string | Quantity;
    unitPrice: string | Money;
    currency: string;
    fees?: string | Money;
    taxes?: string | Money;
    tradeDate: string | LocalDate;
    settlementDate?: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): TradeTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const quantity =
      props.quantity instanceof Quantity ? props.quantity : Quantity.from(props.quantity);
    const unitPrice =
      props.unitPrice instanceof Money
        ? props.unitPrice
        : Money.from(props.unitPrice, common.currency);

    if (!quantity.isPositive()) {
      throw new InvalidTransactionError(
        `SELL transaction requires positive quantity, received '${quantity.value}'`,
      );
    }
    if (unitPrice.isNegative()) {
      throw new InvalidTransactionError(
        `SELL transaction requires unitPrice >= 0, received '${unitPrice.amount}'`,
      );
    }

    const fees = props.fees
      ? props.fees instanceof Money
        ? props.fees
        : Money.from(props.fees, common.currency)
      : undefined;
    const taxes = props.taxes
      ? props.taxes instanceof Money
        ? props.taxes
        : Money.from(props.taxes, common.currency)
      : undefined;

    if (fees && fees.isNegative()) {
      throw new InvalidTransactionError('Fees must have a positive magnitude');
    }
    if (taxes && taxes.isNegative()) {
      throw new InvalidTransactionError('Taxes must have a positive magnitude');
    }

    const tx: TradeTransaction = {
      ...common,
      type: 'SELL',
      assetId,
      quantity,
      unitPrice,
      fees,
      taxes,
    };
    return Object.freeze(tx);
  }

  static createIncome(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    type: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
    amount: string | Money;
    currency: string;
    tradeDate: string | LocalDate;
    settlementDate?: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): IncomeTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const amount =
      props.amount instanceof Money ? props.amount : Money.from(props.amount, common.currency);

    if (!amount.isPositive()) {
      throw new InvalidTransactionError(
        `${props.type} transaction requires positive amount, received '${amount.amount}'`,
      );
    }

    const tx: IncomeTransaction = {
      ...common,
      type: props.type,
      assetId,
      amount,
    };
    return Object.freeze(tx);
  }

  static createSplit(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    type: 'SPLIT' | 'REVERSE_SPLIT';
    factor: string | Quantity;
    currency: string;
    tradeDate: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): SplitTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const factor = props.factor instanceof Quantity ? props.factor : Quantity.from(props.factor);

    if (!factor.isPositive()) {
      throw new InvalidTransactionError(
        `${props.type} requires factor > 0, received '${factor.value}'`,
      );
    }

    const tx: SplitTransaction = {
      ...common,
      type: props.type,
      assetId,
      factor,
    };
    return Object.freeze(tx);
  }

  static createBonus(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    quantity: string | Quantity;
    currency: string;
    tradeDate: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): BonusTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const quantity =
      props.quantity instanceof Quantity ? props.quantity : Quantity.from(props.quantity);

    if (!quantity.isPositive()) {
      throw new InvalidTransactionError(
        `BONUS transaction requires quantity > 0, received '${quantity.value}'`,
      );
    }

    const tx: BonusTransaction = {
      ...common,
      type: 'BONUS',
      assetId,
      quantity,
    };
    return Object.freeze(tx);
  }

  static createSubscription(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    quantity: string | Quantity;
    unitPrice: string | Money;
    currency: string;
    tradeDate: string | LocalDate;
    settlementDate?: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): SubscriptionTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const quantity =
      props.quantity instanceof Quantity ? props.quantity : Quantity.from(props.quantity);
    const unitPrice =
      props.unitPrice instanceof Money
        ? props.unitPrice
        : Money.from(props.unitPrice, common.currency);

    if (!quantity.isPositive()) {
      throw new InvalidTransactionError('SUBSCRIPTION requires quantity > 0');
    }
    if (unitPrice.isNegative()) {
      throw new InvalidTransactionError('SUBSCRIPTION requires unitPrice >= 0');
    }

    const tx: SubscriptionTransaction = {
      ...common,
      type: 'SUBSCRIPTION',
      assetId,
      quantity,
      unitPrice,
    };
    return Object.freeze(tx);
  }

  static createAmortization(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    amount: string | Money;
    currency: string;
    tradeDate: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): AmortizationTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const amount =
      props.amount instanceof Money ? props.amount : Money.from(props.amount, common.currency);

    if (!amount.isPositive()) {
      throw new InvalidTransactionError('AMORTIZATION requires amount > 0');
    }

    const tx: AmortizationTransaction = {
      ...common,
      type: 'AMORTIZATION',
      assetId,
      amount,
    };
    return Object.freeze(tx);
  }

  static createTransfer(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    type: 'TRANSFER_IN' | 'TRANSFER_OUT';
    quantity: string | Quantity;
    currency: string;
    tradeDate: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): TransferTransaction {
    const common = this.parseCommon(props);
    const assetId = createAssetId(props.assetId);
    const quantity =
      props.quantity instanceof Quantity ? props.quantity : Quantity.from(props.quantity);

    if (!quantity.isPositive()) {
      throw new InvalidTransactionError(
        `${props.type} requires quantity > 0, received '${quantity.value}'`,
      );
    }

    const tx: TransferTransaction = {
      ...common,
      type: props.type,
      assetId,
      quantity,
    };
    return Object.freeze(tx);
  }

  static createCashMovement(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amount: string | Money;
    currency: string;
    tradeDate: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): CashMovementTransaction {
    const common = this.parseCommon(props);
    const amount =
      props.amount instanceof Money ? props.amount : Money.from(props.amount, common.currency);

    if (!amount.isPositive()) {
      throw new InvalidTransactionError(
        `${props.type} requires positive amount, received '${amount.amount}'`,
      );
    }

    const tx: CashMovementTransaction = {
      ...common,
      type: props.type,
      amount,
    };
    return Object.freeze(tx);
  }

  static createExpense(props: {
    id?: string;
    portfolioId: string;
    accountId: string;
    type: 'FEE' | 'TAX';
    amount: string | Money;
    currency: string;
    assetId?: string;
    tradeDate: string | LocalDate;
    source?: string;
    provider?: string;
    externalId?: string;
    notes?: string;
    createdAt?: Date;
  }): ExpenseTransaction {
    const common = this.parseCommon(props);
    const assetId = props.assetId ? createAssetId(props.assetId) : undefined;
    const amount =
      props.amount instanceof Money ? props.amount : Money.from(props.amount, common.currency);

    if (!amount.isPositive()) {
      throw new InvalidTransactionError(
        `${props.type} requires positive magnitude, received '${amount.amount}'`,
      );
    }

    const tx: ExpenseTransaction = {
      ...common,
      type: props.type,
      amount,
      assetId,
    };
    return Object.freeze(tx);
  }
}

export function serializeTransaction(tx: Transaction): TransactionJSON {
  const json: TransactionJSON = {
    id: tx.id,
    portfolioId: tx.portfolioId,
    accountId: tx.accountId,
    type: tx.type,
    currency: tx.currency,
    tradeDate: tx.tradeDate.toString(),
    ...(tx.settlementDate ? { settlementDate: tx.settlementDate.toString() } : {}),
    source: tx.source,
    ...(tx.provider ? { provider: tx.provider } : {}),
    ...(tx.externalId ? { externalId: tx.externalId } : {}),
    ...(tx.notes ? { notes: tx.notes } : {}),
    createdAt: tx.createdAt.toISOString(),
  };

  if ('assetId' in tx && tx.assetId) {
    json.assetId = tx.assetId;
  }
  if ('quantity' in tx && tx.quantity) {
    json.quantity = tx.quantity.toString();
  }
  if ('unitPrice' in tx && tx.unitPrice) {
    json.unitPrice = tx.unitPrice.toJSON();
  }
  if ('fees' in tx && tx.fees) {
    json.fees = tx.fees.toJSON();
  }
  if ('taxes' in tx && tx.taxes) {
    json.taxes = tx.taxes.toJSON();
  }
  if ('amount' in tx && tx.amount) {
    json.amount = tx.amount.toJSON();
  }
  if ('factor' in tx && tx.factor) {
    json.factor = tx.factor.toString();
  }

  return json;
}
