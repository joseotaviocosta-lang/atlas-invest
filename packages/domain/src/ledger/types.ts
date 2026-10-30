export const ASSET_TYPES = [
  'STOCK',
  'FII',
  'ETF',
  'BDR',
  'FIXED_INCOME',
  'TREASURY',
  'FUND',
  'CASH',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const TRANSACTION_TYPES = [
  'BUY',
  'SELL',
  'DIVIDEND',
  'JCP',
  'FII_INCOME',
  'BONUS',
  'SPLIT',
  'REVERSE_SPLIT',
  'SUBSCRIPTION',
  'AMORTIZATION',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RECEIPT_CONVERSION',
  'DEPOSIT',
  'WITHDRAWAL',
  'FEE',
  'TAX',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SOURCES = [
  'MANUAL',
  'CSV',
  'BROKER_NOTE',
  'B3',
  'OPEN_FINANCE',
  'BROKER_API',
  'SYSTEM',
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const PORTFOLIO_TYPES = ['PERSONAL', 'FAMILY', 'COMPANY', 'SIMULATION'] as const;
export type PortfolioType = (typeof PORTFOLIO_TYPES)[number];

export const INSTITUTION_TYPES = ['BROKER', 'BANK', 'CUSTODIAN', 'OTHER'] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'CLOSED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const PORTFOLIO_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const ASSET_STATUSES = ['ACTIVE', 'DELISTED'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
