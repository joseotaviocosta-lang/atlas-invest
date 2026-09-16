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
  findByIdAndUserId(id: string, userId: string): Promise<Portfolio | null>;
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

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  id?: string;
  email: string;
  name: string;
  passwordHash: string;
  locale?: string;
  timezone?: string;
  baseCurrency?: string;
}

export interface IUserRepository {
  create(data: CreateUserData): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ipHash: string | null;
  deviceName: string | null;
}

export interface CreateSessionData {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipHash?: string;
  deviceName?: string;
}

export interface ISessionRepository {
  create(data: CreateSessionData): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null>;
  findByPreviousRefreshTokenHash(previousRefreshTokenHash: string): Promise<SessionRecord | null>;
  rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date,
  ): Promise<SessionRecord>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  touchLastUsed(sessionId: string): Promise<void>;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreatePasswordResetTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IPasswordResetTokenRepository {
  create(data: CreatePasswordResetTokenData): Promise<PasswordResetTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  markAsUsed(id: string): Promise<void>;
}
