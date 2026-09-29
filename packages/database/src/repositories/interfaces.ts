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

// ---------------------------------------------------------------------------
// Phase 4B.3 — canonical tax input persistence
// ---------------------------------------------------------------------------

export type TaxInputWriteOutcome = 'CREATED' | 'DUPLICATE' | 'CONFLICT';

export type TaxInputResolutionAction = 'KEEP_EXISTING' | 'ACCEPT_NEW';

export interface TaxInputWriteResult<T> {
  outcome: TaxInputWriteOutcome;
  record: T;
}

export interface TaxTradeClassificationRow {
  id: string;
  taxSubjectId: string;
  transactionId: string;
  classification: string;
  sourceType: string;
  sourceReference: string;
  effectiveDate: Date;
  status: string;
  conflictStatus: string;
  fingerprint: string;
  provenance: Record<string, unknown>;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface TaxWithholdingRow {
  id: string;
  taxSubjectId: string;
  competence: string;
  economicDate: Date;
  category: string;
  /** Exact decimal string, or null when status is UNKNOWN. */
  amount: string | null;
  currency: string;
  status: string;
  sourceType: string;
  sourceReference: string;
  conflictStatus: string;
  fingerprint: string;
  provenance: Record<string, unknown>;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface FiiTaxEligibilityRow {
  id: string;
  taxSubjectId: string;
  assetId: string;
  asOfDate: Date;
  holderCount: number | null;
  /** Exact decimal string. */
  investorOwnershipPercent: string | null;
  isExchangeTraded: boolean | null;
  sourceType: string;
  sourceReference: string;
  status: string;
  conflictStatus: string;
  fingerprint: string;
  provenance: Record<string, unknown>;
  createdAt: Date;
}

export interface ITaxInputRepository {
  upsertTradeClassification(input: {
    taxSubjectId: string;
    transactionId: string;
    classification: string;
    sourceType: string;
    sourceReference: string;
    effectiveDate: Date;
    status: string;
    fingerprint: string;
    provenance: Record<string, unknown>;
  }): Promise<TaxInputWriteResult<TaxTradeClassificationRow>>;
  listTradeClassifications(
    taxSubjectId: string,
    transactionIds?: readonly string[],
  ): Promise<TaxTradeClassificationRow[]>;
  resolveTradeClassification(
    id: string,
    input: { action: TaxInputResolutionAction; resolutionSource: string; taxSubjectId: string },
  ): Promise<TaxTradeClassificationRow | null>;

  upsertWithholding(input: {
    taxSubjectId: string;
    competence: string;
    economicDate: Date;
    category: string;
    amount: string | null;
    currency: string;
    status: string;
    sourceType: string;
    sourceReference: string;
    fingerprint: string;
    provenance: Record<string, unknown>;
  }): Promise<TaxInputWriteResult<TaxWithholdingRow>>;
  listWithholdings(taxSubjectId: string, competence?: string): Promise<TaxWithholdingRow[]>;
  resolveWithholding(
    id: string,
    input: { action: TaxInputResolutionAction; resolutionSource: string; taxSubjectId: string },
  ): Promise<TaxWithholdingRow | null>;

  upsertFiiEligibility(input: {
    taxSubjectId: string;
    assetId: string;
    asOfDate: Date;
    holderCount: number | null;
    investorOwnershipPercent: string | null;
    isExchangeTraded: boolean | null;
    sourceType: string;
    sourceReference: string;
    status: string;
    fingerprint: string;
    provenance: Record<string, unknown>;
  }): Promise<TaxInputWriteResult<FiiTaxEligibilityRow>>;
  listFiiEligibility(
    taxSubjectId: string,
    assetIds: readonly string[],
    asOfDate: Date,
  ): Promise<FiiTaxEligibilityRow[]>;
  resolveFiiEligibility(
    id: string,
    input: { action: TaxInputResolutionAction; resolutionSource: string; taxSubjectId: string },
  ): Promise<FiiTaxEligibilityRow | null>;
}

// ---------------------------------------------------------------------------
// Phase 4C.2 — direct federal tax deadline registry, obligations & payments
// ---------------------------------------------------------------------------

export type DeadlineRegistryWriteOutcome = 'CREATED' | 'DUPLICATE' | 'CONFLICT';
export type ObligationWriteOutcome = 'CREATED' | 'DUPLICATE' | 'SUPERSEDED';
export type PaymentWriteOutcome = 'CREATED' | 'DUPLICATE' | 'CONFLICT';

export interface FederalTaxDeadlineRow {
  id: string;
  revenueCode: string;
  taxBucket: string;
  competence: string;
  dueDate: Date;
  status: string;
  sourceAuthority: string;
  sourceDocument: string;
  sourceReference: string;
  sourcePublishedAt: Date;
  verifiedAt: Date;
  version: number;
  supersedesEntryId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface TaxObligationRow {
  id: string;
  taxSubjectId: string;
  competence: string;
  taxBucket: string | null;
  revenueCode: string | null;
  liabilityFingerprint: string;
  revision: number;
  deadlineEntryId: string | null;
  /** Exact decimal string, or null when no payable principal exists. */
  principalAmount: string | null;
  currency: string | null;
  dueDate: Date | null;
  status: string;
  reasonCode: string | null;
  darfReadiness: string;
  darfReadinessReason: string | null;
  dataQuality: string;
  supersededById: string | null;
  provenance: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxPaymentEvidenceRow {
  id: string;
  obligationId: string;
  taxSubjectId: string;
  paidAt: Date;
  /** Exact decimal string. */
  amount: string;
  currency: string;
  sourceType: string;
  sourceReference: string | null;
  confirmedAt: Date;
  status: string;
  fingerprint: string;
  createdAt: Date;
}

export interface IFederalTaxDeadlineRepository {
  /** All entries, newest version first (used for resolution + audit). */
  listAll(): Promise<FederalTaxDeadlineRow[]>;
  listByRevenueCodeAndCompetence(
    revenueCode: string,
    competence: string,
  ): Promise<FederalTaxDeadlineRow[]>;
  findById(id: string): Promise<FederalTaxDeadlineRow | null>;
  /** Inserts a new immutable version. Fails closed on duplicate version. */
  createEntry(input: {
    id?: string;
    revenueCode: string;
    taxBucket: string;
    competence: string;
    dueDate: Date;
    status: string;
    sourceAuthority: string;
    sourceDocument: string;
    sourceReference: string;
    sourcePublishedAt: Date;
    verifiedAt: Date;
    version: number;
    supersedesEntryId: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ outcome: DeadlineRegistryWriteOutcome; record: FederalTaxDeadlineRow }>;
  /** Marks a previous version as superseded by a new entry (immutable history). */
  markSuperseded(id: string, supersededByEntryId: string): Promise<FederalTaxDeadlineRow | null>;
}

export interface ITaxObligationRepository {
  findById(id: string, taxSubjectId: string): Promise<TaxObligationRow | null>;
  list(
    taxSubjectId: string,
    filter?: { competence?: string; status?: string; bucket?: string },
  ): Promise<TaxObligationRow[]>;
  findLatestByIdentity(
    taxSubjectId: string,
    competence: string,
    liabilityFingerprint: string,
  ): Promise<TaxObligationRow | null>;
  /** Idempotent materialization: same binding => DUPLICATE; changed => new revision. */
  materialize(input: {
    taxSubjectId: string;
    competence: string;
    taxBucket: string | null;
    revenueCode: string | null;
    liabilityFingerprint: string;
    deadlineEntryId: string | null;
    principalAmount: string | null;
    currency: string | null;
    dueDate: Date | null;
    status: string;
    reasonCode: string | null;
    darfReadiness: string;
    darfReadinessReason: string | null;
    dataQuality: string;
    provenance: Record<string, unknown>;
  }): Promise<{ outcome: ObligationWriteOutcome; record: TaxObligationRow }>;
  markPaid(id: string, taxSubjectId: string): Promise<TaxObligationRow | null>;
  markReconciliationRequired(id: string, taxSubjectId: string): Promise<TaxObligationRow | null>;
}

export interface ITaxPaymentEvidenceRepository {
  listByObligation(obligationId: string, taxSubjectId: string): Promise<TaxPaymentEvidenceRow[]>;
  findById(id: string, taxSubjectId: string): Promise<TaxPaymentEvidenceRow | null>;
  record(input: {
    obligationId: string;
    taxSubjectId: string;
    paidAt: Date;
    amount: string;
    currency: string;
    sourceType: string;
    sourceReference: string | null;
    confirmedAt: Date;
    status: string;
    fingerprint: string;
  }): Promise<{ outcome: PaymentWriteOutcome; record: TaxPaymentEvidenceRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4D.2 — official late-fee authority & SELIC rate snapshots
// ---------------------------------------------------------------------------

export interface OfficialLateFeeRow {
  id: string;
  municipalityCode: string;
  dueDate: Date;
  paymentDate: Date;
  /** Exact decimal string. */
  principalAmount: string;
  lateFeeAmount: string;
  lateFeePercent: string;
  startBusinessDate: Date | null;
  sourceSystem: string;
  sourceReference: string;
  sourceRetrievedAt: Date;
  verifiedAt: Date;
  version: number;
  fingerprint: string;
  createdAt: Date;
}

export interface TaxInterestRateRow {
  id: string;
  indexName: string;
  referenceMonth: string;
  /** Exact decimal string. */
  ratePercent: string;
  sourceAuthority: string;
  sourceReference: string;
  sourceRetrievedAt: Date;
  verifiedAt: Date;
  version: number;
  createdAt: Date;
}

export interface IOfficialLateFeeRepository {
  findLatest(input: {
    municipalityCode: string;
    dueDate: Date;
    paymentDate: Date;
    principalAmount: string;
  }): Promise<OfficialLateFeeRow | null>;
  create(input: {
    municipalityCode: string;
    dueDate: Date;
    paymentDate: Date;
    principalAmount: string;
    lateFeeAmount: string;
    lateFeePercent: string;
    startBusinessDate: Date | null;
    sourceSystem: string;
    sourceReference: string;
    sourceRetrievedAt: Date;
    verifiedAt: Date;
    version: number;
    fingerprint: string;
  }): Promise<{ outcome: 'CREATED' | 'DUPLICATE'; record: OfficialLateFeeRow }>;
}

export interface ITaxInterestRateRepository {
  listByIndexAndMonths(indexName: string, months: readonly string[]): Promise<TaxInterestRateRow[]>;
  create(input: {
    indexName: string;
    referenceMonth: string;
    ratePercent: string;
    sourceAuthority: string;
    sourceReference: string;
    sourceRetrievedAt: Date;
    verifiedAt: Date;
    version: number;
  }): Promise<{ outcome: 'CREATED' | 'DUPLICATE'; record: TaxInterestRateRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4E — minimum DARF carry-forward & payment aggregation
// ---------------------------------------------------------------------------

export type CarryForwardWriteOutcome = 'CREATED' | 'DUPLICATE';
export type AggregationWriteOutcome = 'CREATED' | 'DUPLICATE';
export type CarryForwardConsumptionOutcome = 'CONSUMED' | 'ALREADY_CONSUMED' | 'NOT_FOUND';

export interface TaxCarryForwardEntryRow {
  id: string;
  taxSubjectId: string;
  sourceObligationId: string;
  sourceCompetence: string;
  revenueCode: string;
  currency: string;
  /** Exact decimal string. */
  amount: string;
  status: string;
  targetCompetence: string | null;
  consumedByAggregationId: string | null;
  consumedAt: Date | null;
  ruleId: string;
  ruleVersion: string;
  fingerprint: string;
  createdAt: Date;
}

export interface TaxPaymentAggregationRow {
  id: string;
  taxSubjectId: string;
  revenueCode: string;
  targetCompetence: string;
  currency: string;
  /** Exact decimal strings. */
  currentAmount: string;
  carryForwardAmount: string;
  totalPayable: string;
  minimumThreshold: string;
  sourceEntryIds: string[];
  currentObligationId: string | null;
  dueDate: Date | null;
  status: string;
  ruleId: string;
  ruleVersion: string;
  fingerprint: string;
  createdAt: Date;
}

export interface ITaxCarryForwardRepository {
  findById(id: string, taxSubjectId: string): Promise<TaxCarryForwardEntryRow | null>;
  /** OPEN entries of a revenue code targeted at or before `competence`. */
  listOpenForCompetence(
    taxSubjectId: string,
    revenueCode: string,
    competence: string,
  ): Promise<TaxCarryForwardEntryRow[]>;
  listBySubject(
    taxSubjectId: string,
    filter?: { revenueCode?: string },
  ): Promise<TaxCarryForwardEntryRow[]>;
  /** Idempotent by source identity `(sourceObligationId, ruleId, ruleVersion)`. */
  createEntry(input: {
    taxSubjectId: string;
    sourceObligationId: string;
    sourceCompetence: string;
    revenueCode: string;
    currency: string;
    amount: string;
    targetCompetence: string | null;
    ruleId: string;
    ruleVersion: string;
    fingerprint: string;
  }): Promise<{ outcome: CarryForwardWriteOutcome; record: TaxCarryForwardEntryRow }>;
  /** Explicit, exactly-once consumption inside a single transaction. */
  consumeEntries(input: {
    taxSubjectId: string;
    entryIds: readonly string[];
    aggregationId: string;
    consumedAt: Date;
  }): Promise<{ outcome: CarryForwardConsumptionOutcome; consumed: number }>;
  markSuperseded(id: string, taxSubjectId: string): Promise<TaxCarryForwardEntryRow | null>;
}

// ---------------------------------------------------------------------------
// Phase 4F — taxpayer identity & official DARF generation/handoff records
// ---------------------------------------------------------------------------

export interface TaxpayerIdentityRow {
  id: string;
  userId: string;
  identityType: string;
  /** Masked display form only (never the raw identifier). */
  maskedIdentifier: string;
  /** Opaque HMAC-SHA256 reference (never the raw identifier). */
  secureReference: string;
  identityAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OfficialDarfGenerationRow {
  id: string;
  taxSubjectId: string;
  taxObligationId: string | null;
  taxPaymentAggregationId: string | null;
  generationMode: string;
  revenueCode: string;
  competence: string;
  dueDate: Date | null;
  /** Exact decimal strings. */
  principalAmount: string;
  lateFeeAmount: string | null;
  interestAmount: string | null;
  totalAmount: string;
  currency: string;
  officialDocumentId: string | null;
  officialReference: string | null;
  sourceSystem: string;
  status: string;
  version: number;
  fingerprint: string;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaxpayerIdentityRepository {
  findByUserId(userId: string): Promise<TaxpayerIdentityRow | null>;
  /** Upsert by user; stores only masked form + opaque reference (no raw PII). */
  upsert(input: {
    userId: string;
    identityType: string;
    maskedIdentifier: string;
    secureReference: string;
    identityAvailable: boolean;
  }): Promise<TaxpayerIdentityRow>;
}

export interface IOfficialDarfGenerationRepository {
  findById(id: string, taxSubjectId: string): Promise<OfficialDarfGenerationRow | null>;
  list(
    taxSubjectId: string,
    filter?: { status?: string; obligationId?: string },
  ): Promise<OfficialDarfGenerationRow[]>;
  findLatestByIdentity(
    taxSubjectId: string,
    taxObligationId: string,
    fingerprint: string,
  ): Promise<OfficialDarfGenerationRow | null>;
  /** Idempotent materialization; a changed fingerprint supersedes the previous record. */
  materialize(input: {
    taxSubjectId: string;
    taxObligationId: string | null;
    taxPaymentAggregationId: string | null;
    generationMode: string;
    revenueCode: string;
    competence: string;
    dueDate: Date | null;
    principalAmount: string;
    lateFeeAmount: string | null;
    interestAmount: string | null;
    totalAmount: string;
    currency: string;
    sourceSystem: string;
    status: string;
    fingerprint: string;
  }): Promise<{
    outcome: 'CREATED' | 'DUPLICATE' | 'SUPERSEDED';
    record: OfficialDarfGenerationRow;
  }>;
}

export interface ITaxPaymentAggregationRepository {
  findById(id: string, taxSubjectId: string): Promise<TaxPaymentAggregationRow | null>;
  findLatestForCompetence(
    taxSubjectId: string,
    revenueCode: string,
    competence: string,
  ): Promise<TaxPaymentAggregationRow | null>;
  create(input: {
    taxSubjectId: string;
    revenueCode: string;
    targetCompetence: string;
    currency: string;
    currentAmount: string;
    carryForwardAmount: string;
    totalPayable: string;
    minimumThreshold: string;
    sourceEntryIds: readonly string[];
    currentObligationId: string | null;
    dueDate: Date | null;
    status: string;
    ruleId: string;
    ruleVersion: string;
    fingerprint: string;
  }): Promise<{ outcome: AggregationWriteOutcome; record: TaxPaymentAggregationRow }>;
}
