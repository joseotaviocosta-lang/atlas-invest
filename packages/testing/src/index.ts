import {
  Asset,
  Institution,
  Portfolio,
  Account,
  TransactionFactory,
  TradeTransaction,
  IncomeTransaction,
  LocalDate,
} from '@atlas/domain';

export const TESTING_VERSION = '0.1.0';

/**
 * Shared assertion helper.
 */
export function assertDefined<T>(val: T | null | undefined, name = 'Value'): asserts val is T {
  if (val === null || val === undefined) {
    throw new Error(`Expected ${name} to be defined, but received ${String(val)}`);
  }
}

/**
 * Factory for creating a test Asset with sensible defaults.
 */
export function createTestAsset(overrides?: {
  id?: string;
  ticker?: string;
  name?: string;
  type?: 'STOCK' | 'FII' | 'ETF' | 'BDR' | 'FIXED_INCOME' | 'TREASURY' | 'FUND' | 'CASH';
  currency?: string;
  exchange?: string;
  isin?: string;
  cnpj?: string;
}): Asset {
  return Asset.create({
    id: overrides?.id ?? '11111111-1111-4111-8111-111111111111',
    ticker: overrides?.ticker ?? 'PETR4',
    name: overrides?.name ?? 'Petróleo Brasileiro S.A.',
    type: overrides?.type ?? 'STOCK',
    currency: overrides?.currency ?? 'BRL',
    exchange: overrides?.exchange ?? 'B3',
    isin: overrides?.isin ?? 'BRPETRACNPR6',
    cnpj: overrides?.cnpj,
  });
}

/**
 * Factory for creating a test Institution with sensible defaults.
 */
export function createTestInstitution(overrides?: {
  id?: string;
  name?: string;
  type?: 'BROKER' | 'BANK' | 'CUSTODIAN' | 'OTHER';
  country?: string;
}): Institution {
  return Institution.create({
    id: overrides?.id ?? '22222222-2222-4222-8222-222222222222',
    name: overrides?.name ?? 'XP Investimentos',
    type: overrides?.type ?? 'BROKER',
    country: overrides?.country ?? 'BR',
  });
}

/**
 * Factory for creating a test Portfolio with sensible defaults.
 */
export function createTestPortfolio(overrides?: {
  id?: string;
  userId?: string;
  name?: string;
  baseCurrency?: string;
  type?: 'PERSONAL' | 'FAMILY' | 'COMPANY' | 'SIMULATION';
  createdAt?: Date;
  updatedAt?: Date;
}): Portfolio {
  return Portfolio.create({
    id: overrides?.id ?? '33333333-3333-4333-8333-333333333333',
    userId: overrides?.userId ?? '44444444-4444-4444-8444-444444444444',
    name: overrides?.name ?? 'Carteira Principal',
    baseCurrency: overrides?.baseCurrency ?? 'BRL',
    type: overrides?.type ?? 'PERSONAL',
    createdAt: overrides?.createdAt,
    updatedAt: overrides?.updatedAt,
  });
}

/**
 * Factory for creating a test Account with sensible defaults.
 */
export function createTestAccount(overrides?: {
  id?: string;
  portfolioId?: string;
  institutionId?: string;
  name?: string;
  currency?: string;
}): Account {
  return Account.create({
    id: overrides?.id ?? '55555555-5555-4555-8555-555555555555',
    portfolioId: overrides?.portfolioId ?? '33333333-3333-4333-8333-333333333333',
    institutionId: overrides?.institutionId ?? '22222222-2222-4222-8222-222222222222',
    name: overrides?.name ?? 'Conta Corretora XP',
    currency: overrides?.currency ?? 'BRL',
  });
}

/**
 * Factory for creating a test BUY transaction.
 */
export function createBuyTransaction(overrides?: {
  id?: string;
  portfolioId?: string;
  accountId?: string;
  assetId?: string;
  quantity?: string;
  unitPrice?: string;
  currency?: string;
  fees?: string;
  taxes?: string;
  tradeDate?: string | LocalDate;
  source?: string;
}): TradeTransaction {
  return TransactionFactory.createBuy({
    id: overrides?.id ?? '66666666-6666-4666-8666-666666666666',
    portfolioId: overrides?.portfolioId ?? '33333333-3333-4333-8333-333333333333',
    accountId: overrides?.accountId ?? '55555555-5555-4555-8555-555555555555',
    assetId: overrides?.assetId ?? '11111111-1111-4111-8111-111111111111',
    quantity: overrides?.quantity ?? '100',
    unitPrice: overrides?.unitPrice ?? '35.50',
    currency: overrides?.currency ?? 'BRL',
    fees: overrides?.fees ?? '4.50',
    taxes: overrides?.taxes,
    tradeDate: overrides?.tradeDate ?? '2026-09-15',
    source: overrides?.source ?? 'MANUAL',
  });
}

/**
 * Factory for creating a test SELL transaction.
 */
export function createSellTransaction(overrides?: {
  id?: string;
  portfolioId?: string;
  accountId?: string;
  assetId?: string;
  quantity?: string;
  unitPrice?: string;
  currency?: string;
  fees?: string;
  taxes?: string;
  tradeDate?: string | LocalDate;
  source?: string;
}): TradeTransaction {
  return TransactionFactory.createSell({
    id: overrides?.id ?? '77777777-7777-4777-8777-777777777777',
    portfolioId: overrides?.portfolioId ?? '33333333-3333-4333-8333-333333333333',
    accountId: overrides?.accountId ?? '55555555-5555-4555-8555-555555555555',
    assetId: overrides?.assetId ?? '11111111-1111-4111-8111-111111111111',
    quantity: overrides?.quantity ?? '50',
    unitPrice: overrides?.unitPrice ?? '38.00',
    currency: overrides?.currency ?? 'BRL',
    fees: overrides?.fees ?? '4.50',
    taxes: overrides?.taxes,
    tradeDate: overrides?.tradeDate ?? '2026-09-15',
    source: overrides?.source ?? 'MANUAL',
  });
}

/**
 * Factory for creating a test DIVIDEND transaction.
 */
export function createDividendTransaction(overrides?: {
  id?: string;
  portfolioId?: string;
  accountId?: string;
  assetId?: string;
  amount?: string;
  currency?: string;
  tradeDate?: string | LocalDate;
  source?: string;
}): IncomeTransaction {
  return TransactionFactory.createIncome({
    id: overrides?.id ?? '88888888-8888-4888-8888-888888888888',
    portfolioId: overrides?.portfolioId ?? '33333333-3333-4333-8333-333333333333',
    accountId: overrides?.accountId ?? '55555555-5555-4555-8555-555555555555',
    assetId: overrides?.assetId ?? '11111111-1111-4111-8111-111111111111',
    type: 'DIVIDEND',
    amount: overrides?.amount ?? '120.00',
    currency: overrides?.currency ?? 'BRL',
    tradeDate: overrides?.tradeDate ?? '2026-09-15',
    source: overrides?.source ?? 'MANUAL',
  });
}
