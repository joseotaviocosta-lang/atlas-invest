import { Transaction as PrismaTransaction, Prisma } from '@prisma/client';
import {
  Transaction,
  TransactionFactory,
  TradeTransaction,
  IncomeTransaction,
  SplitTransaction,
  BonusTransaction,
  SubscriptionTransaction,
  AmortizationTransaction,
  TransferTransaction,
  CashMovementTransaction,
  ExpenseTransaction,
} from '@atlas/domain';
import { DateConverter } from './date-converter';
import { DecimalConverter } from './decimal-converter';
import { PersistenceMappingError } from '../errors/persistence-mapping-error';

export class TransactionMapper {
  static toPersistence(entity: Transaction): Prisma.TransactionUncheckedCreateInput {
    const tradeDate = DateConverter.toPersistence(entity.tradeDate);
    if (!tradeDate) {
      throw new PersistenceMappingError('tradeDate cannot be null');
    }

    const base: Prisma.TransactionUncheckedCreateInput = {
      id: entity.id,
      portfolioId: entity.portfolioId,
      accountId: entity.accountId,
      type: entity.type,
      currency: entity.currency,
      tradeDate,
      settlementDate: DateConverter.toPersistence(entity.settlementDate),
      source: entity.source,
      provider: entity.provider ?? null,
      externalId: entity.externalId ?? null,
      notes: entity.notes ?? null,
      createdAt: entity.createdAt,
    };

    switch (entity.type) {
      case 'BUY':
      case 'SELL': {
        const tx = entity as TradeTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          quantity: DecimalConverter.toPersistence(tx.quantity.value),
          unitPrice: DecimalConverter.toPersistence(tx.unitPrice.amount),
          fees: DecimalConverter.toPersistence(tx.fees?.amount),
          taxes: DecimalConverter.toPersistence(tx.taxes?.amount),
        };
      }
      case 'DIVIDEND':
      case 'JCP':
      case 'FII_INCOME': {
        const tx = entity as IncomeTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          amount: DecimalConverter.toPersistence(tx.amount.amount),
        };
      }
      case 'SPLIT':
      case 'REVERSE_SPLIT': {
        const tx = entity as SplitTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          factor: DecimalConverter.toPersistence(tx.factor.value),
        };
      }
      case 'BONUS': {
        const tx = entity as BonusTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          quantity: DecimalConverter.toPersistence(tx.quantity.value),
        };
      }
      case 'SUBSCRIPTION': {
        const tx = entity as SubscriptionTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          quantity: DecimalConverter.toPersistence(tx.quantity.value),
          unitPrice: DecimalConverter.toPersistence(tx.unitPrice.amount),
        };
      }
      case 'AMORTIZATION': {
        const tx = entity as AmortizationTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          amount: DecimalConverter.toPersistence(tx.amount.amount),
        };
      }
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT': {
        const tx = entity as TransferTransaction;
        return {
          ...base,
          assetId: tx.assetId,
          quantity: DecimalConverter.toPersistence(tx.quantity.value),
        };
      }
      case 'DEPOSIT':
      case 'WITHDRAWAL': {
        const tx = entity as CashMovementTransaction;
        return {
          ...base,
          amount: DecimalConverter.toPersistence(tx.amount.amount),
        };
      }
      case 'FEE':
      case 'TAX': {
        const tx = entity as ExpenseTransaction;
        return {
          ...base,
          assetId: tx.assetId ?? null,
          amount: DecimalConverter.toPersistence(tx.amount.amount),
        };
      }
      default:
        throw new PersistenceMappingError(
          `Unsupported transaction type: ${(entity as Transaction).type}`,
        );
    }
  }

  static toDomain(raw: PrismaTransaction): Transaction {
    const tradeDate = DateConverter.toDomain(raw.tradeDate);
    if (!tradeDate) {
      throw new PersistenceMappingError('Invalid or missing tradeDate in transaction record');
    }
    const settlementDate = DateConverter.toDomain(raw.settlementDate) ?? undefined;

    const common = {
      id: raw.id,
      portfolioId: raw.portfolioId,
      accountId: raw.accountId,
      currency: raw.currency,
      tradeDate,
      settlementDate,
      source: raw.source,
      provider: raw.provider ?? undefined,
      externalId: raw.externalId ?? undefined,
      notes: raw.notes ?? undefined,
      createdAt: raw.createdAt,
    };

    switch (raw.type) {
      case 'BUY': {
        if (!raw.assetId || raw.quantity === null || raw.unitPrice === null) {
          throw new PersistenceMappingError(
            'BUY transaction requires assetId, quantity, and unitPrice',
          );
        }
        const quantity = DecimalConverter.toCanonicalString(raw.quantity)!;
        const unitPrice = DecimalConverter.toCanonicalString(raw.unitPrice)!;
        const fees = DecimalConverter.toCanonicalString(raw.fees) ?? undefined;
        const taxes = DecimalConverter.toCanonicalString(raw.taxes) ?? undefined;
        return TransactionFactory.createBuy({
          ...common,
          assetId: raw.assetId,
          quantity,
          unitPrice,
          fees,
          taxes,
        });
      }
      case 'SELL': {
        if (!raw.assetId || raw.quantity === null || raw.unitPrice === null) {
          throw new PersistenceMappingError(
            'SELL transaction requires assetId, quantity, and unitPrice',
          );
        }
        const quantity = DecimalConverter.toCanonicalString(raw.quantity)!;
        const unitPrice = DecimalConverter.toCanonicalString(raw.unitPrice)!;
        const fees = DecimalConverter.toCanonicalString(raw.fees) ?? undefined;
        const taxes = DecimalConverter.toCanonicalString(raw.taxes) ?? undefined;
        return TransactionFactory.createSell({
          ...common,
          assetId: raw.assetId,
          quantity,
          unitPrice,
          fees,
          taxes,
        });
      }
      case 'DIVIDEND':
      case 'JCP':
      case 'FII_INCOME': {
        if (!raw.assetId || raw.amount === null) {
          throw new PersistenceMappingError(`${raw.type} transaction requires assetId and amount`);
        }
        const amount = DecimalConverter.toCanonicalString(raw.amount)!;
        return TransactionFactory.createIncome({
          ...common,
          type: raw.type as 'DIVIDEND' | 'JCP' | 'FII_INCOME',
          assetId: raw.assetId,
          amount,
        });
      }
      case 'SPLIT':
      case 'REVERSE_SPLIT': {
        if (!raw.assetId || raw.factor === null) {
          throw new PersistenceMappingError(`${raw.type} transaction requires assetId and factor`);
        }
        const factor = DecimalConverter.toCanonicalString(raw.factor)!;
        return TransactionFactory.createSplit({
          ...common,
          type: raw.type as 'SPLIT' | 'REVERSE_SPLIT',
          assetId: raw.assetId,
          factor,
        });
      }
      case 'BONUS': {
        if (!raw.assetId || raw.quantity === null) {
          throw new PersistenceMappingError('BONUS transaction requires assetId and quantity');
        }
        const quantity = DecimalConverter.toCanonicalString(raw.quantity)!;
        return TransactionFactory.createBonus({
          ...common,
          assetId: raw.assetId,
          quantity,
        });
      }
      case 'SUBSCRIPTION': {
        if (!raw.assetId || raw.quantity === null || raw.unitPrice === null) {
          throw new PersistenceMappingError(
            'SUBSCRIPTION transaction requires assetId, quantity, and unitPrice',
          );
        }
        const quantity = DecimalConverter.toCanonicalString(raw.quantity)!;
        const unitPrice = DecimalConverter.toCanonicalString(raw.unitPrice)!;
        return TransactionFactory.createSubscription({
          ...common,
          assetId: raw.assetId,
          quantity,
          unitPrice,
        });
      }
      case 'AMORTIZATION': {
        if (!raw.assetId || raw.amount === null) {
          throw new PersistenceMappingError('AMORTIZATION transaction requires assetId and amount');
        }
        const amount = DecimalConverter.toCanonicalString(raw.amount)!;
        return TransactionFactory.createAmortization({
          ...common,
          assetId: raw.assetId,
          amount,
        });
      }
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT': {
        if (!raw.assetId || raw.quantity === null) {
          throw new PersistenceMappingError(
            `${raw.type} transaction requires assetId and quantity`,
          );
        }
        const quantity = DecimalConverter.toCanonicalString(raw.quantity)!;
        return TransactionFactory.createTransfer({
          ...common,
          type: raw.type as 'TRANSFER_IN' | 'TRANSFER_OUT',
          assetId: raw.assetId,
          quantity,
        });
      }
      case 'DEPOSIT':
      case 'WITHDRAWAL': {
        if (raw.amount === null) {
          throw new PersistenceMappingError(`${raw.type} transaction requires amount`);
        }
        const amount = DecimalConverter.toCanonicalString(raw.amount)!;
        return TransactionFactory.createCashMovement({
          ...common,
          type: raw.type as 'DEPOSIT' | 'WITHDRAWAL',
          amount,
        });
      }
      case 'FEE':
      case 'TAX': {
        if (raw.amount === null) {
          throw new PersistenceMappingError(`${raw.type} transaction requires amount`);
        }
        const amount = DecimalConverter.toCanonicalString(raw.amount)!;
        return TransactionFactory.createExpense({
          ...common,
          type: raw.type as 'FEE' | 'TAX',
          amount,
          assetId: raw.assetId ?? undefined,
        });
      }
      default:
        throw new PersistenceMappingError(`Unsupported transaction type: ${raw.type}`);
    }
  }
}
