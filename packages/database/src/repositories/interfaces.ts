import { Asset, Institution, Portfolio, Account, Transaction, LocalDate } from '@atlas/domain';

export interface TransactionLedgerFilter {
  accountId?: string;
  assetId?: string;
  type?: string;
  startDate?: LocalDate;
  endDate?: LocalDate;
}

export interface PaginationOptions {
  limit?: number;
  skip?: number;
  cursor?: string;
}

export interface IAssetRepository {
  findById(id: string): Promise<Asset | null>;
  findByTicker(ticker: string): Promise<Asset | null>;
  findByTickerAndExchange(ticker: string, exchange: string): Promise<Asset | null>;
  create(asset: Asset): Promise<Asset>;
  list(): Promise<Asset[]>;
}

export interface IInstitutionRepository {
  findById(id: string): Promise<Institution | null>;
  create(institution: Institution): Promise<Institution>;
  list(): Promise<Institution[]>;
}

export interface IPortfolioRepository {
  findById(id: string): Promise<Portfolio | null>;
  findByUserId(userId: string): Promise<Portfolio[]>;
  create(portfolio: Portfolio): Promise<Portfolio>;
  update(portfolio: Portfolio): Promise<Portfolio>;
}

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByPortfolioId(portfolioId: string): Promise<Account[]>;
  create(account: Account): Promise<Account>;
  update(account: Account): Promise<Account>;
}

export interface ITransactionRepository {
  create(transaction: Transaction): Promise<Transaction>;
  createMany(transactions: Transaction[]): Promise<Transaction[]>;
  findById(id: string): Promise<Transaction | null>;
  findByPortfolioId(
    portfolioId: string,
    filter?: TransactionLedgerFilter,
    pagination?: PaginationOptions,
  ): Promise<Transaction[]>;
  findByExternalId(
    portfolioId: string,
    provider: string,
    externalId: string,
  ): Promise<Transaction | null>;
}
