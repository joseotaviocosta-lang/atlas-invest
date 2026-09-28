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
  /** All canonical assets sharing a ticker (ambiguity detection, Phase 3Z). */
  findAllByTicker(ticker: string): Promise<Asset[]>;
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
  usedRefreshTokenHashes: string[];
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
  findByAnyPreviousRefreshTokenHash(hash: string): Promise<SessionRecord | null>;
  rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date,
    expectedCurrentHash?: string,
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
  markAsUsedIfUnused(id: string): Promise<boolean>;
}

export interface AiConversationRecord {
  id: string;
  userId: string;
  portfolioId: string;
  title: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiConversationMessageRecord {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  status: 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR';
  intent: string | null;
  evidenceSnapshot: unknown | null;
  claims?: unknown | null;
  limitations: string[];
  provider: string | null;
  model: string | null;
  providerRequestId: string | null;
  createdAt: Date;
}

export interface CreateAiConversationData {
  userId: string;
  portfolioId: string;
  title?: string;
}

export interface CreateAiConversationMessageData {
  role: 'USER' | 'ASSISTANT';
  content: string;
  status?: 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR';
  intent?: string | null;
  evidenceSnapshot?: unknown | null;
  claims?: unknown | null;
  limitations?: string[];
  provider?: string | null;
  model?: string | null;
  providerRequestId?: string | null;
}

export interface IAiConversationRepository {
  createConversation(data: CreateAiConversationData): Promise<AiConversationRecord>;
  findConversationById(
    id: string,
    portfolioId: string,
    userId: string,
  ): Promise<AiConversationRecord | null>;
  listConversations(
    portfolioId: string,
    userId: string,
    options?: { limit?: number; cursor?: string; includeArchived?: boolean },
  ): Promise<{ items: AiConversationRecord[]; nextCursor?: string; hasMore: boolean }>;
  archiveConversation(id: string, portfolioId: string, userId: string): Promise<boolean>;
  listMessages(
    conversationId: string,
    options?: { limit?: number; cursor?: string; order?: 'asc' | 'desc' },
  ): Promise<{ items: AiConversationMessageRecord[]; nextCursor?: string; hasMore: boolean }>;
  appendMessage(
    conversationId: string,
    data: CreateAiConversationMessageData,
  ): Promise<AiConversationMessageRecord>;
  appendTurn(
    conversationId: string,
    userMessage: { content: string },
    assistantMessage: {
      content: string;
      status?: 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR';
      intent?: string | null;
      evidenceSnapshot?: unknown | null;
      claims?: unknown | null;
      limitations?: string[];
      provider?: string | null;
      model?: string | null;
      providerRequestId?: string | null;
    },
  ): Promise<{
    userMessage: AiConversationMessageRecord;
    assistantMessage: AiConversationMessageRecord;
  }>;
}

export interface MarketIntelligenceRecord {
  id: string;
  sourceProvider: string;
  sourceType: string;
  sourceItemId: string;
  headline: string;
  excerpt: string | null;
  canonicalUrl: string | null;
  publishedAt: Date;
  retrievedAt: Date;
  category: string;
  language: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  linkedAssetIds: string[];
}

export interface MarketIntelligenceFilter {
  assetId?: string;
  assetIds?: string[];
  from?: Date;
  to?: Date;
  category?: string;
  status?: string;
}

export interface IMarketIntelligenceRepository {
  upsertItem(
    item: {
      sourceProvider: string;
      sourceType: string;
      sourceItemId: string;
      headline: string;
      excerpt?: string;
      canonicalUrl?: string;
      publishedAt: Date;
      category: string;
      language?: string;
      status?: string;
    },
    linkedAssetIds?: string[],
  ): Promise<MarketIntelligenceRecord>;

  batchUpsertItems(
    items: Array<{
      item: {
        sourceProvider: string;
        sourceType: string;
        sourceItemId: string;
        headline: string;
        excerpt?: string;
        canonicalUrl?: string;
        publishedAt: Date;
        category: string;
        language?: string;
        status?: string;
      };
      linkedAssetIds?: string[];
    }>,
  ): Promise<{ accepted: number; duplicates: number }>;

  findById(id: string): Promise<MarketIntelligenceRecord | null>;
  findByProviderAndItemId(
    sourceProvider: string,
    sourceItemId: string,
  ): Promise<MarketIntelligenceRecord | null>;
  list(
    filter?: MarketIntelligenceFilter,
    pagination?: PaginationOptions,
  ): Promise<{ items: MarketIntelligenceRecord[]; nextCursor?: string; hasMore: boolean }>;
}
