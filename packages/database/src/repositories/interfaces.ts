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
  /** Batch lookup by ids in a single query (avoids per-asset queries). */
  findByIds(ids: readonly string[]): Promise<Asset[]>;
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
  /** Batch lookup by ids in a single query (avoids per-transaction queries). */
  findByIds(ids: readonly string[]): Promise<Transaction[]>;
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
  deactivatedAt?: Date | null;
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
  /** Explicit IRRF pool classifier (null on legacy rows). */
  withholdingCategory: string | null;
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
    withholdingCategory: string | null;
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

// ---------------------------------------------------------------------------
// Phase 4G.2A.1a — tax compensation election persistence (immutable revisions)
// ---------------------------------------------------------------------------

export type TaxCompensationElectionWriteOutcome = 'CREATED' | 'DUPLICATE';

export interface TaxCompensationElectionRow {
  id: string;
  taxSubjectId: string;
  competence: string;
  electionType: string;
  value: string;
  version: number;
  source: string;
  supersedesId: string | null;
  fingerprint: string;
  createdAt: Date;
}

export interface ITaxCompensationElectionRepository {
  /** Current effective revision (highest version), or null when none exists. */
  findCurrent(input: {
    taxSubjectId: string;
    competence: string;
    electionType: string;
  }): Promise<TaxCompensationElectionRow | null>;
  /** Full immutable revision history in ascending version order. */
  listHistory(input: {
    taxSubjectId: string;
    competence: string;
    electionType: string;
  }): Promise<TaxCompensationElectionRow[]>;
  /**
   * Current effective revision per competence for a subject+type (bulk read;
   * avoids one query per competence during historical replay).
   */
  listCurrentBySubject(input: {
    taxSubjectId: string;
    electionType: string;
  }): Promise<TaxCompensationElectionRow[]>;
  /**
   * Appends a revision. Same value as current → idempotent DUPLICATE (no new
   * version); different value → new monotonic version superseding the previous.
   */
  putRevision(input: {
    taxSubjectId: string;
    competence: string;
    electionType: string;
    value: string;
    source: string;
  }): Promise<{ outcome: TaxCompensationElectionWriteOutcome; record: TaxCompensationElectionRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4H.2 — annual opening position persistence (immutable revisions)
// ---------------------------------------------------------------------------

export type AnnualOpeningPositionWriteOutcome = 'CREATED' | 'IDEMPOTENT_CONFIRMED' | 'SUPERSEDED';

export interface AnnualOpeningPositionRow {
  id: string;
  taxSubjectId: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  effectiveDate: Date;
  quantity: string;
  totalHistoricalCost: string;
  currency: string;
  source: string;
  status: string;
  revision: number;
  fingerprint: string;
  notes: string | null;
  supersedesId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnnualOpeningPositionRepository {
  findById(id: string): Promise<AnnualOpeningPositionRow | null>;
  findCurrentByAsset(input: {
    taxSubjectId: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
  }): Promise<AnnualOpeningPositionRow | null>;
  listByPortfolio(input: {
    taxSubjectId: string;
    portfolioId: string;
    status?: string;
  }): Promise<AnnualOpeningPositionRow[]>;
  listBySubject(input: {
    taxSubjectId: string;
    status?: string;
  }): Promise<AnnualOpeningPositionRow[]>;
  create(input: {
    id?: string;
    taxSubjectId: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    effectiveDate: Date;
    quantity: string;
    totalHistoricalCost: string;
    currency: string;
    source: string;
    status?: string;
    notes?: string;
  }): Promise<{ outcome: AnnualOpeningPositionWriteOutcome; record: AnnualOpeningPositionRow }>;
  confirm(id: string, taxSubjectId: string): Promise<AnnualOpeningPositionRow | null>;
}

// ---------------------------------------------------------------------------
// Phase 4H.5 — taxpayer confirmation persistence (immutable revisions)
// ---------------------------------------------------------------------------

export type TaxpayerConfirmationWriteOutcome = 'CREATED' | 'IDEMPOTENT' | 'SUPERSEDED';

export interface TaxpayerConfirmationRow {
  id: string;
  taxSubjectId: string;
  calendarYear: number;
  confirmationType: string;
  subjectReference: string;
  decision: string;
  statementVersion: string;
  sourceFingerprint: string;
  source: string;
  createdByPrincipal: string;
  revision: number;
  fingerprint: string;
  supersedesId: string | null;
  notes: string | null;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaxpayerConfirmationRepository {
  findById(id: string): Promise<TaxpayerConfirmationRow | null>;
  findLatest(input: {
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
  }): Promise<TaxpayerConfirmationRow | null>;
  listByYear(input: {
    taxSubjectId: string;
    calendarYear: number;
  }): Promise<TaxpayerConfirmationRow[]>;
  listHistory(input: {
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
  }): Promise<TaxpayerConfirmationRow[]>;
  create(input: {
    id?: string;
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
    decision: string;
    statementVersion: string;
    sourceFingerprint: string;
    source: string;
    createdByPrincipal: string;
    notes?: string | null;
  }): Promise<{ outcome: TaxpayerConfirmationWriteOutcome; record: TaxpayerConfirmationRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4I.4 — high-income annual evidence persistence (immutable revisions)
// ---------------------------------------------------------------------------

export type HighIncomeEvidenceType =
  'CORPORATE_TAX' | 'ANNUAL_ADJUSTMENT_IRPF' | 'ANNUAL_INCOME_TOTAL';

export type HighIncomeEvidenceAuthority = 'AUTHORITATIVE' | 'REQUIRES_CONFIRMATION';

export type HighIncomeEvidenceSource =
  'PJ_FINANCIAL_STATEMENTS' | 'RFB_PREFILLED' | 'TAXPAYER_CONFIRMED';

export type HighIncomeEvidenceConflictStatus = 'NONE' | 'CONFLICT';

export type HighIncomeEvidenceResolutionDecision = 'KEEP_EXISTING' | 'ACCEPT_NEW';

export type HighIncomeEvidenceWriteOutcome = 'CREATED' | 'IDEMPOTENT' | 'SUPERSEDED';

export interface HighIncomeEvidenceRow {
  id: string;
  taxSubjectId: string;
  calendarYear: number;
  payerKey: string;
  payerId: string | null;
  evidenceType: HighIncomeEvidenceType;
  payerType: string | null;
  profitPeriodExercise: number | null;
  evidenceMode: string | null;
  accountingProfit: string | null;
  irDue: string | null;
  csllDue: string | null;
  prouniTaxCredit: string | null;
  simplifiedRevenue: string | null;
  adjustmentAmount: string | null;
  authority: HighIncomeEvidenceAuthority;
  evidenceSource: HighIncomeEvidenceSource;
  conflictStatus: HighIncomeEvidenceConflictStatus;
  upstreamFingerprint: string | null;
  sourceFingerprint: string;
  revision: number;
  fingerprint: string;
  supersedesId: string | null;
  resolutionNote: string | null;
  createdByPrincipal: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HighIncomeEvidenceWriteInput {
  id?: string;
  taxSubjectId: string;
  calendarYear: number;
  payerId?: string | null;
  evidenceType: HighIncomeEvidenceType;
  payerType?: string | null;
  profitPeriodExercise?: number | null;
  evidenceMode?: string | null;
  accountingProfit?: string | null;
  irDue?: string | null;
  csllDue?: string | null;
  prouniTaxCredit?: string | null;
  simplifiedRevenue?: string | null;
  adjustmentAmount?: string | null;
  authority: HighIncomeEvidenceAuthority;
  evidenceSource: HighIncomeEvidenceSource;
  upstreamFingerprint?: string | null;
  sourceFingerprint?: string | null;
  createdByPrincipal: string;
  resolutionNote?: string | null;
}

export interface IHighIncomeEvidenceRepository {
  findById(id: string): Promise<HighIncomeEvidenceRow | null>;
  findCurrent(input: {
    taxSubjectId: string;
    calendarYear: number;
    payerKey: string;
    evidenceType: HighIncomeEvidenceType;
    profitPeriodExercise?: number | null;
  }): Promise<HighIncomeEvidenceRow | null>;
  listCurrentBySubjectYear(input: {
    taxSubjectId: string;
    calendarYear: number;
  }): Promise<HighIncomeEvidenceRow[]>;
  listHistory(input: {
    taxSubjectId: string;
    calendarYear: number;
    payerKey: string;
    evidenceType: HighIncomeEvidenceType;
    profitPeriodExercise?: number | null;
  }): Promise<HighIncomeEvidenceRow[]>;
  create(
    input: HighIncomeEvidenceWriteInput,
  ): Promise<{ outcome: HighIncomeEvidenceWriteOutcome; record: HighIncomeEvidenceRow }>;
  resolve(input: {
    id: string;
    taxSubjectId: string;
    decision: HighIncomeEvidenceResolutionDecision;
    createdByPrincipal: string;
  }): Promise<{ outcome: HighIncomeEvidenceWriteOutcome; record: HighIncomeEvidenceRow }>;
  watermark(input: {
    taxSubjectId: string;
    calendarYear: number;
  }): Promise<{ count: number; maxUpdatedAt: string | null }>;
}

// ---------------------------------------------------------------------------
// Phase 4K.1 — taxpayer compliance workflow actions persistence
// ---------------------------------------------------------------------------

export type TaxComplianceActionWriteOutcome = 'CREATED' | 'IDEMPOTENT' | 'SUPERSEDED';

export interface TaxComplianceActionRow {
  id: string;
  taxSubjectId: string;
  obligationKey: string;
  actionType: string;
  sourceFingerprint: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  revision: number;
  occurredAt: Date;
  createdAt: Date;
}

export interface TaxComplianceActionWriteInput {
  id?: string;
  taxSubjectId: string;
  obligationKey: string;
  actionType: string;
  sourceFingerprint?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date | string;
}

export interface ITaxComplianceActionRepository {
  findById(id: string): Promise<TaxComplianceActionRow | null>;
  findLatest(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxComplianceActionRow | null>;
  listBySubject(input: {
    taxSubjectId: string;
    obligationKey?: string;
  }): Promise<TaxComplianceActionRow[]>;
  listHistory(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxComplianceActionRow[]>;
  create(
    input: TaxComplianceActionWriteInput,
  ): Promise<{ outcome: TaxComplianceActionWriteOutcome; record: TaxComplianceActionRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4K.2 — taxpayer payment settlement evidence persistence
// ---------------------------------------------------------------------------

export type TaxSettlementWriteOutcome = 'CREATED' | 'IDEMPOTENT' | 'SUPERSEDED';

export interface TaxSettlementRow {
  id: string;
  taxSubjectId: string;
  obligationKey: string;
  sourceFingerprint: string;
  evidenceFingerprint: string;
  revision: number;
  paymentDate: Date;
  amountReported: string;
  revenueCodeReported: string | null;
  referencePeriod: string;
  externalReference: string | null;
  note: string | null;
  verificationStatus: string;
  createdAt: Date;
}

export interface TaxSettlementWriteInput {
  id?: string;
  taxSubjectId: string;
  obligationKey: string;
  sourceFingerprint: string;
  evidenceFingerprint?: string;
  paymentDate: Date | string;
  amountReported: string;
  revenueCodeReported?: string | null;
  referencePeriod: string;
  externalReference?: string | null;
  note?: string | null;
  verificationStatus?: string;
}

export interface ITaxSettlementRepository {
  findById(id: string): Promise<TaxSettlementRow | null>;
  findLatest(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxSettlementRow | null>;
  listBySubject(input: {
    taxSubjectId: string;
    obligationKey?: string;
  }): Promise<TaxSettlementRow[]>;
  listHistory(input: { taxSubjectId: string; obligationKey: string }): Promise<TaxSettlementRow[]>;
  create(
    input: TaxSettlementWriteInput,
  ): Promise<{ outcome: TaxSettlementWriteOutcome; record: TaxSettlementRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4K.3 — compliance reminder actions, notification events, preferences
// ---------------------------------------------------------------------------

export type TaxReminderActionWriteOutcome = 'CREATED' | 'IDEMPOTENT' | 'SUPERSEDED';

export interface TaxReminderActionRow {
  id: string;
  taxSubjectId: string;
  reminderKey: string;
  obligationKey: string;
  reminderKind: string;
  triggerAt: Date;
  sourceFingerprint: string;
  actionType: string;
  snoozedUntil: Date | null;
  revision: number;
  occurredAt: Date;
  createdAt: Date;
}

export interface TaxReminderActionWriteInput {
  id?: string;
  taxSubjectId: string;
  reminderKey: string;
  obligationKey: string;
  reminderKind: string;
  triggerAt: Date | string;
  sourceFingerprint: string;
  actionType: string;
  snoozedUntil?: Date | string | null;
  occurredAt?: Date | string;
}

export interface ITaxReminderActionRepository {
  findLatest(input: {
    taxSubjectId: string;
    reminderKey: string;
  }): Promise<TaxReminderActionRow | null>;
  listBySubject(input: {
    taxSubjectId: string;
    reminderKey?: string;
  }): Promise<TaxReminderActionRow[]>;
  create(
    input: TaxReminderActionWriteInput,
  ): Promise<{ outcome: TaxReminderActionWriteOutcome; record: TaxReminderActionRow }>;
}

export type TaxNotificationEventWriteOutcome = 'DELIVERED' | 'IDEMPOTENT';

export interface TaxNotificationEventRow {
  id: string;
  taxSubjectId: string;
  reminderKey: string;
  sourceFingerprint: string;
  channel: string;
  triggerAt: Date;
  deliveredAt: Date;
  deliveryStatus: string;
  attempt: number;
  dedupKey: string;
  createdAt: Date;
}

export interface TaxNotificationEventWriteInput {
  id?: string;
  taxSubjectId: string;
  reminderKey: string;
  sourceFingerprint: string;
  channel: string;
  triggerAt: Date | string;
  deliveryStatus?: string;
  dedupKey: string;
}

export interface ITaxNotificationEventRepository {
  findByDedup(input: {
    taxSubjectId: string;
    dedupKey: string;
  }): Promise<TaxNotificationEventRow | null>;
  listBySubject(input: {
    taxSubjectId: string;
    reminderKey?: string;
  }): Promise<TaxNotificationEventRow[]>;
  create(
    input: TaxNotificationEventWriteInput,
  ): Promise<{ outcome: TaxNotificationEventWriteOutcome; record: TaxNotificationEventRow }>;
}

export interface TaxReminderPreferencesRow {
  taxSubjectId: string;
  remindersEnabled: boolean;
  upcomingEnabled: boolean;
  overdueEnabled: boolean;
  annualEnabled: boolean;
  leadTimes: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxReminderPreferencesWriteInput {
  taxSubjectId: string;
  remindersEnabled: boolean;
  upcomingEnabled: boolean;
  overdueEnabled: boolean;
  annualEnabled: boolean;
  leadTimes: number[];
}

export interface ITaxReminderPreferencesRepository {
  findBySubject(taxSubjectId: string): Promise<TaxReminderPreferencesRow | null>;
  upsert(
    input: TaxReminderPreferencesWriteInput,
  ): Promise<{ created: boolean; record: TaxReminderPreferencesRow }>;
}

// ---------------------------------------------------------------------------
// Phase 4K.5 — operational period close history (support snapshots only)
// ---------------------------------------------------------------------------

export type TaxPeriodCloseScope = 'MONTHLY' | 'ANNUAL';

export type TaxPeriodCloseRecordStatus = 'CLOSED' | 'REOPENED';

export type TaxPeriodCloseWriteOutcome = 'CREATED' | 'IDEMPOTENT' | 'REOPENED';

export interface TaxPeriodCloseRow {
  id: string;
  taxSubjectId: string;
  scope: string;
  period: string;
  calendarYear: number;
  month: string | null;
  exercise: number | null;
  revision: number;
  recordStatus: string;
  statusAtClose: string | null;
  closeMode: string | null;
  sourceFingerprint: string;
  binderFingerprint: string;
  reason: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

export interface TaxPeriodCloseWriteInput {
  id?: string;
  taxSubjectId: string;
  scope: string;
  period: string;
  calendarYear: number;
  month?: string | null;
  exercise?: number | null;
  statusAtClose?: string | null;
  closeMode?: string | null;
  sourceFingerprint: string;
  binderFingerprint: string;
  closedAt?: Date | string | null;
}

export interface TaxPeriodReopenInput {
  id?: string;
  taxSubjectId: string;
  scope: string;
  period: string;
  reason: string;
}

export interface ITaxPeriodCloseRepository {
  findLatest(input: {
    taxSubjectId: string;
    scope: string;
    period: string;
  }): Promise<TaxPeriodCloseRow | null>;
  findById(id: string, taxSubjectId: string): Promise<TaxPeriodCloseRow | null>;
  findClosedByFingerprints(input: {
    taxSubjectId: string;
    scope: string;
    period: string;
    sourceFingerprint: string;
    binderFingerprint: string;
  }): Promise<TaxPeriodCloseRow | null>;
  listHistory(input: {
    taxSubjectId: string;
    scope?: string;
    period?: string;
    limit: number;
    offset: number;
  }): Promise<TaxPeriodCloseRow[]>;
  countHistory(input: { taxSubjectId: string; scope?: string; period?: string }): Promise<number>;
  recordClose(
    input: TaxPeriodCloseWriteInput,
  ): Promise<{ outcome: 'CREATED' | 'IDEMPOTENT'; record: TaxPeriodCloseRow }>;
  recordReopen(
    input: TaxPeriodReopenInput,
  ): Promise<{ outcome: TaxPeriodCloseWriteOutcome; record: TaxPeriodCloseRow }>;
}

// ---------------------------------------------------------------------------
// Market Quote Repository (Phase 5A)
// ---------------------------------------------------------------------------

export interface MarketQuoteRecordRow {
  id: string;
  assetId: string;
  tradingDate: LocalDate;
  currency: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string;
  adjustedClose: string | null;
  volume: string | null;
  provider: string;
  providerSymbol: string;
  firstFetchedAt: Date;
  lastFetchedAt: Date;
  fetchCount: number;
  revisedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketQuoteRevisionRecordRow {
  id: string;
  marketQuoteId: string;
  changedAt: Date;
  priorOpen: string | null;
  priorHigh: string | null;
  priorLow: string | null;
  priorClose: string;
  priorAdjustedClose: string | null;
  priorVolume: string | null;
  newOpen: string | null;
  newHigh: string | null;
  newLow: string | null;
  newClose: string;
  newAdjustedClose: string | null;
  newVolume: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface MarketQuoteUpsertInput {
  assetId: string;
  tradingDate: LocalDate;
  currency: string;
  open?: string | null;
  high?: string | null;
  low?: string | null;
  close: string;
  adjustedClose?: string | null;
  volume?: string | null;
  provider: string;
  providerSymbol: string;
  reason?: string | null;
}

export type MarketQuoteUpsertOutcome = 'INSERTED' | 'UNCHANGED' | 'REVISED';

export interface IMarketQuoteRepository {
  findLatest(assetId: string, provider?: string): Promise<MarketQuoteRecordRow | null>;
  findLatestByAssets(
    assetIds: readonly string[],
    provider?: string,
  ): Promise<Map<string, MarketQuoteRecordRow>>;
  findByAssetDate(
    assetId: string,
    tradingDate: LocalDate,
    provider?: string,
  ): Promise<MarketQuoteRecordRow | null>;
  findRange(
    assetId: string,
    from: LocalDate,
    to: LocalDate,
    provider?: string,
  ): Promise<MarketQuoteRecordRow[]>;
  upsertQuote(input: MarketQuoteUpsertInput): Promise<{
    outcome: MarketQuoteUpsertOutcome;
    quote: MarketQuoteRecordRow;
    revision?: MarketQuoteRevisionRecordRow;
  }>;
  listRevisions(marketQuoteId: string): Promise<MarketQuoteRevisionRecordRow[]>;
}

// ============================================================================
// Phase 5B: Benchmark Observations & Revisions Repository
// ============================================================================

export interface BenchmarkObservationRecordRow {
  id: string;
  benchmarkId: string;
  referenceDate: LocalDate;
  value: string;
  unit: string;
  frequency: string;
  source: string;
  providerSeriesId: string | null;
  firstFetchedAt: Date;
  lastFetchedAt: Date;
  fetchCount: number;
  revisedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BenchmarkObservationRevisionRecordRow {
  id: string;
  benchmarkObservationId: string;
  changedAt: Date;
  priorValue: string;
  newValue: string;
  reason: string | null;
  createdAt: Date;
}

export interface BenchmarkObservationUpsertInput {
  benchmarkId: string;
  referenceDate: LocalDate;
  value: string;
  unit: string;
  frequency: string;
  source: string;
  providerSeriesId?: string | null;
  reason?: string | null;
}

export type BenchmarkObservationUpsertOutcome = 'INSERTED' | 'UNCHANGED' | 'REVISED';

export interface IBenchmarkObservationRepository {
  findObservation(
    benchmarkId: string,
    referenceDate: LocalDate,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow | null>;

  findObservations(
    benchmarkId: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow[]>;

  findLatest(benchmarkId: string, source?: string): Promise<BenchmarkObservationRecordRow | null>;

  upsertObservation(input: BenchmarkObservationUpsertInput): Promise<{
    outcome: BenchmarkObservationUpsertOutcome;
    observation: BenchmarkObservationRecordRow;
    revision?: BenchmarkObservationRevisionRecordRow;
  }>;

  getCoverage(benchmarkId: string): Promise<{
    totalObservations: number;
    firstObservationDate: LocalDate | null;
    lastObservationDate: LocalDate | null;
  }>;

  listRevisions(benchmarkObservationId: string): Promise<BenchmarkObservationRevisionRecordRow[]>;
}

// ============================================================================
// Phase 5C: FX Observations & Revisions Repository
// ============================================================================

export interface FxObservationRecordRow {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  observationDate: LocalDate;
  rate: string;
  rateType: string;
  source: string;
  providerSeriesId: string | null;
  firstFetchedAt: Date;
  lastFetchedAt: Date;
  fetchCount: number;
  revisedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FxObservationRevisionRecordRow {
  id: string;
  fxObservationId: string;
  changedAt: Date;
  priorRate: string;
  newRate: string;
  reason: string | null;
  createdAt: Date;
}

export interface FxObservationUpsertInput {
  baseCurrency: string;
  quoteCurrency: string;
  observationDate: LocalDate;
  rate: string;
  rateType?: string;
  source: string;
  providerSeriesId?: string | null;
  reason?: string | null;
}

export type FxObservationUpsertOutcome = 'INSERTED' | 'UNCHANGED' | 'REVISED';

export interface IFxObservationRepository {
  findObservation(
    baseCurrency: string,
    quoteCurrency: string,
    observationDate: LocalDate,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow | null>;

  findObservations(
    baseCurrency: string,
    quoteCurrency: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow[]>;

  findLatest(
    baseCurrency: string,
    quoteCurrency: string,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow | null>;

  upsertObservation(input: FxObservationUpsertInput): Promise<{
    outcome: FxObservationUpsertOutcome;
    observation: FxObservationRecordRow;
    revision?: FxObservationRevisionRecordRow;
  }>;

  getCoverage(
    baseCurrency: string,
    quoteCurrency: string,
    source?: string,
    rateType?: string,
  ): Promise<{
    totalObservations: number;
    firstObservationDate: LocalDate | null;
    lastObservationDate: LocalDate | null;
  }>;

  listRevisions(fxObservationId: string): Promise<FxObservationRevisionRecordRow[]>;
}

// ---------------------------------------------------------------------------
// Phase 5D — Official Calendar Days
// ---------------------------------------------------------------------------

export interface CalendarDayRow {
  id: string;
  calendarType: string;
  date: LocalDate;
  isOpen: boolean;
  reason: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarDayUpsertInput {
  calendarType: string;
  date: LocalDate;
  isOpen: boolean;
  reason?: string | null;
  source: string;
}

export interface ICalendarRepository {
  findDay(calendarType: string, date: LocalDate): Promise<CalendarDayRow | null>;
  findDays(calendarType: string, from: LocalDate, to: LocalDate): Promise<CalendarDayRow[]>;
  saveMany(days: CalendarDayUpsertInput[]): Promise<{ inserted: number; updated: number }>;
  getCoverage(calendarType: string): Promise<{
    minDate: LocalDate | null;
    maxDate: LocalDate | null;
    totalDays: number;
    openDays: number;
    closedDays: number;
    sources: string[];
    latestImportedAt: Date | null;
  }>;
}

// ---------------------------------------------------------------------------
// Phase 5D — Canonical Macroeconomic Series Observations & Revisions
// ---------------------------------------------------------------------------

export interface MacroObservationRecordRow {
  id: string;
  seriesId: string;
  referenceDate: LocalDate;
  value: string;
  unit: string;
  frequency: string;
  source: string;
  publishedAt: Date | null;
  firstFetchedAt: Date;
  lastFetchedAt: Date;
  fetchCount: number;
  revisedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MacroObservationRevisionRecordRow {
  id: string;
  macroObservationId: string;
  changedAt: Date;
  priorValue: string;
  newValue: string;
  reason: string | null;
  createdAt: Date;
}

export interface MacroObservationUpsertInput {
  seriesId: string;
  referenceDate: LocalDate;
  value: string;
  unit: string;
  frequency: string;
  source: string;
  publishedAt?: Date | null;
  reason?: string | null;
}

export type MacroObservationUpsertOutcome = 'INSERTED' | 'UNCHANGED' | 'REVISED';

export interface IMacroRepository {
  findObservation(
    seriesId: string,
    referenceDate: LocalDate,
    source?: string,
  ): Promise<MacroObservationRecordRow | null>;
  findObservations(
    seriesId: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
  ): Promise<MacroObservationRecordRow[]>;
  findLatest(seriesId: string, source?: string): Promise<MacroObservationRecordRow | null>;
  upsertObservation(input: MacroObservationUpsertInput): Promise<{
    outcome: MacroObservationUpsertOutcome;
    observation: MacroObservationRecordRow;
    revision?: MacroObservationRevisionRecordRow;
  }>;
  getCoverage(
    seriesId: string,
    source?: string,
  ): Promise<{
    count: number;
    minReferenceDate: LocalDate | null;
    maxReferenceDate: LocalDate | null;
    latestPublishedAt: Date | null;
    source: string | null;
    frequency: string | null;
  }>;
  listRevisions(macroObservationId: string): Promise<MacroObservationRevisionRecordRow[]>;
}

/**
 * Phase 5P-PRE — operational history of import/sync executions.
 *
 * One row per run; canonical events stay in `transactions` (linked via the
 * loose `integration_run_id` provenance column). Runs are append-mostly and
 * immutable once terminal (COMPLETED/PARTIAL/FAILED). No per-item table:
 * per-row detail is reconstructible from the ledger (provider/externalId/
 * fingerprint) plus read models.
 */
export type IntegrationRunSource = 'B3' | 'CSV' | 'MANUAL';

export type IntegrationRunStatus =
  'STARTED' | 'AWAITING_REVIEW' | 'CONFIRMING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export type IntegrationRunEnvironment = 'SIMULATED' | 'CERT' | 'PROD';

export interface IntegrationRunReconciliation {
  matched: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
}

export interface IntegrationRunRow {
  id: string;
  portfolioId: string;
  source: string;
  provider: string | null;
  environment: string | null;
  fileName: string | null;
  sourceAsOf: string | null;
  status: string;
  recordsFetched: number;
  recordsNormalized: number;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  confirmed: number;
  ignored: number;
  reconciliation: IntegrationRunReconciliation | null;
  partial: boolean;
  /** Phase 5P-A: 'MANUAL' for human-driven runs, 'SCHEDULED' for background jobs. Null for pre-5P-A rows. */
  trigger: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationRunCreateInput {
  id?: string;
  portfolioId: string;
  source: string;
  provider?: string | null;
  environment?: string | null;
  fileName?: string | null;
  sourceAsOf?: string | null;
  trigger?: string | null;
}

export interface IntegrationRunPreviewInput {
  id: string;
  portfolioId: string;
  status: 'AWAITING_REVIEW';
  recordsFetched: number;
  recordsNormalized: number;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  /** Phase 5P-A: source returned partial data (scheduled sync). Informational at preview. */
  partial?: boolean;
  sourceAsOf?: string | null;
}

export interface IntegrationRunConfirmationInput {
  id: string;
  portfolioId: string;
  status: 'COMPLETED' | 'PARTIAL';
  confirmed: number;
  ignored: number;
  reconciliation?: IntegrationRunReconciliation | null;
  partial: boolean;
  sourceAsOf?: string | null;
}

export interface IntegrationRunFailureInput {
  id: string;
  portfolioId: string;
  errorCode: string;
  /** Safe user-facing message. Never raw payloads, stacks, tokens or PII. */
  errorMessage: string;
}

export interface IntegrationRunLinkInput {
  runId: string;
  portfolioId: string;
  transactionIds: string[];
}

export type IntegrationScheduleCadence = 'MANUAL_ONLY' | 'DAILY' | 'WEEKDAYS';

export type IntegrationJobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface IntegrationScheduleRow {
  id: string;
  portfolioId: string;
  source: string;
  provider: string;
  environment: string;
  cadence: string;
  hourLocal: number | null;
  minuteLocal: number | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationScheduleCreateInput {
  id?: string;
  portfolioId: string;
  source: string;
  provider?: string | null;
  environment?: string | null;
  cadence: string;
  hourLocal?: number | null;
  minuteLocal?: number | null;
  timezone?: string | null;
  enabled?: boolean;
  nextRunAt?: Date | null;
}

export interface IntegrationScheduleUpdateInput {
  id: string;
  portfolioId: string;
  enabled?: boolean;
  cadence?: string;
  hourLocal?: number | null;
  minuteLocal?: number | null;
  timezone?: string;
  nextRunAt?: Date | null;
}

export interface IntegrationScheduleTouchInput {
  id: string;
  portfolioId: string;
  nextRunAt: Date | null;
  lastRunAt?: Date | null;
  lastStatus?: string | null;
}

export interface IntegrationConnectionRow {
  id: string;
  portfolioId: string;
  source: string;
  provider: string;
  environment: string;
  status: string;
  authorizedAt: Date | null;
  revokedAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationConnectionEnsureInput {
  portfolioId: string;
  source: string;
  provider?: string | null;
  environment?: string | null;
}

export interface IntegrationConnectionUpdateInput {
  id: string;
  portfolioId: string;
  status: string;
  authorizedAt?: Date | null;
  revokedAt?: Date | null;
  lastCheckedAt?: Date | null;
}

/**
 * Phase 5P-D: portfolio↔source connection rows. One row per
 * (portfolio, source); `ensure` is idempotent for concurrent begins and
 * `update` is ownership-scoped (id + portfolioId). No secrets ever reach
 * this table (see STEP 21 guard).
 */
export interface IIntegrationConnectionRepository {
  findByPortfolioAndSource(
    portfolioId: string,
    source: string,
  ): Promise<IntegrationConnectionRow | null>;
  ensure(input: IntegrationConnectionEnsureInput): Promise<IntegrationConnectionRow>;
  update(input: IntegrationConnectionUpdateInput): Promise<IntegrationConnectionRow>;
}

export interface PortfolioAllocationStrategyTargetRow {
  id: string;
  portfolioId: string;
  category: string;
  targetBp: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioAllocationStrategyTargetInput {
  category: string;
  targetBp: number;
}

/**
 * Phase 5Q-C: user-defined allocation strategy targets. One row per
 * (portfolio, category); replace() swaps the whole set atomically so a
 * strategy can never persist half-written (total invariant holds or the
 * whole write fails).
 */
export interface IAllocationStrategyRepository {
  listByPortfolio(portfolioId: string): Promise<PortfolioAllocationStrategyTargetRow[]>;
  replace(
    portfolioId: string,
    targets: readonly PortfolioAllocationStrategyTargetInput[],
  ): Promise<PortfolioAllocationStrategyTargetRow[]>;
  clear(portfolioId: string): Promise<void>;
}

export interface PortfolioAllocationScenarioChangeRow {
  id: string;
  scenarioId: string;
  category: string;
  /** Canonical decimal money string (exact, never float). */
  amount: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioAllocationScenarioRow {
  id: string;
  portfolioId: string;
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  changes: PortfolioAllocationScenarioChangeRow[];
}

export interface PortfolioAllocationScenarioChangeInput {
  category: string;
  /** Canonical decimal money string (exact, never float). */
  amount: string;
}

export interface PortfolioAllocationScenarioWriteInput {
  name: string;
  type: string;
  changes: readonly PortfolioAllocationScenarioChangeInput[];
}

/**
 * Phase 5Q-E: saved hypothetical allocation scenarios (input only).
 * Persists the user's declared hypothesis — name, type, per-category
 * hypothetical amounts. Never projected weights, deviations, coverage
 * or recommendations: results are recomputed live. Writes are atomic
 * (scenario + full change set in one transaction); replace() returns
 * null and remove() returns false when the scoped scenario is absent.
 */
export interface IAllocationScenarioRepository {
  countByPortfolio(portfolioId: string): Promise<number>;
  listByPortfolio(portfolioId: string): Promise<PortfolioAllocationScenarioRow[]>;
  findByIdAndPortfolio(
    scenarioId: string,
    portfolioId: string,
  ): Promise<PortfolioAllocationScenarioRow | null>;
  create(
    portfolioId: string,
    input: PortfolioAllocationScenarioWriteInput,
  ): Promise<PortfolioAllocationScenarioRow>;
  replace(
    scenarioId: string,
    portfolioId: string,
    input: PortfolioAllocationScenarioWriteInput,
  ): Promise<PortfolioAllocationScenarioRow | null>;
  remove(scenarioId: string, portfolioId: string): Promise<boolean>;
}

export interface PortfolioContributionPlanItemRow {
  id: string;
  planId: string;
  category: string;
  /** Canonical decimal money string (exact, never float). */
  amount: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioContributionPlanRow {
  id: string;
  portfolioId: string;
  name: string;
  /** Date-only civil date `YYYY-MM-DD` (never a timestamp). */
  plannedDate: string;
  status: string;
  currency: string;
  sourceScenarioId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: PortfolioContributionPlanItemRow[];
}

export interface PortfolioContributionPlanItemInput {
  category: string;
  /** Canonical decimal money string (exact, never float). */
  amount: string;
}

export interface PortfolioContributionPlanWriteInput {
  name: string;
  /** Date-only civil date `YYYY-MM-DD`. */
  plannedDate: string;
  currency: string;
  sourceScenarioId?: string | null;
  items: readonly PortfolioContributionPlanItemInput[];
}

/**
 * Phase 5Q-F: user-declared contribution plans (future intent, not advice).
 * Persists ONLY the declared intent — name, date, per-category amounts.
 * Never transactions, orders, projected values or recommendations.
 * Writes are atomic (plan + full item set in one transaction).
 * Status changes are guarded: setStatus() only moves out of PLANNED and
 * returns null otherwise (single transition wins under concurrency);
 * replace()/remove() only touch PLANNED plans and return null/false
 * otherwise (terminal history stays immutable).
 */
export interface IContributionPlanRepository {
  countActiveByPortfolio(portfolioId: string): Promise<number>;
  listByPortfolio(portfolioId: string, status?: string): Promise<PortfolioContributionPlanRow[]>;
  findNextPlanned(portfolioId: string): Promise<PortfolioContributionPlanRow | null>;
  findByIdAndPortfolio(
    planId: string,
    portfolioId: string,
  ): Promise<PortfolioContributionPlanRow | null>;
  create(
    portfolioId: string,
    input: PortfolioContributionPlanWriteInput,
  ): Promise<PortfolioContributionPlanRow>;
  replace(
    planId: string,
    portfolioId: string,
    input: PortfolioContributionPlanWriteInput,
  ): Promise<PortfolioContributionPlanRow | null>;
  setStatus(
    planId: string,
    portfolioId: string,
    status: 'COMPLETED' | 'CANCELLED',
  ): Promise<PortfolioContributionPlanRow | null>;
  remove(planId: string, portfolioId: string): Promise<boolean>;
}

export interface PortfolioContributionGoalRow {
  id: string;
  portfolioId: string;
  /** Canonical decimal money string (exact, never float). */
  amount: string;
  currency: string;
  /** Inclusive first effective day of the month (`YYYY-MM-01`). */
  effectiveFrom: string;
  /** Exclusive end day, or null when open-ended. */
  effectiveTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Phase 5Q-J: versioned user-defined monthly contribution goals.
 * One row per effective version ([effectiveFrom, effectiveTo), NULL end
 * = open); only one open row per portfolio (partial unique index).
 * `replaceOpen` is atomic: close + create in one transaction, with an
 * optional optimistic `expectedUpdatedAt` guard so concurrent writers
 * converge on exactly one winner. History rows are never mutated.
 */
export interface IContributionGoalRepository {
  listByPortfolio(portfolioId: string): Promise<PortfolioContributionGoalRow[]>;
  findOpen(portfolioId: string): Promise<PortfolioContributionGoalRow | null>;
  replaceOpen(
    portfolioId: string,
    input: {
      amount: string;
      currency: string;
      /** First day of the effective month (`YYYY-MM-01`). */
      effectiveFrom: string;
      /** First day of the closing month (`YYYY-MM-01`), or null when the open version starts then. */
      closeOpenAt: string | null;
      expectedUpdatedAt?: Date;
    },
  ): Promise<PortfolioContributionGoalRow | null>;
  updateAmountIfOpen(
    goalId: string,
    portfolioId: string,
    amount: string,
    expectedUpdatedAt: Date,
  ): Promise<PortfolioContributionGoalRow | null>;
  endOpen(
    portfolioId: string,
    closeMonthFirstDay: string,
  ): Promise<PortfolioContributionGoalRow | null>;
  removeById(goalId: string, portfolioId: string): Promise<boolean>;
}

export interface ContributionPlanLinkRow {
  id: string;
  planId: string;
  transactionId: string;
  status: 'CONFIRMED' | 'REJECTED';
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Phase 5Q-G: plan ↔ transaction links (relation + audit state only).
 * Persists CONFIRMED and REJECTED rows; candidates are derived on read.
 * No amounts, dates, categories or currencies stored — facts come from
 * the ledger and the plan. setStatus() is guarded: CONFIRMED wins the
 * partial unique index on transactionId, so a second plan's confirm
 * throws (fail-closed, no double-counted actuals). removeLink() only
 * flips CONFIRMED → REJECTED (audit preserved).
 */
export interface IContributionPlanLinkRepository {
  listByPlan(planId: string): Promise<ContributionPlanLinkRow[]>;
  /** Batch read for N plans in one query (no per-plan reads). */
  listByPlanIds(planIds: readonly string[]): Promise<Map<string, ContributionPlanLinkRow[]>>;
  findConfirmedByTransaction(transactionId: string): Promise<ContributionPlanLinkRow | null>;
  /** Batch confirmed lookup (one query): transactionId → owning planId. */
  findConfirmedByTransactionIds(transactionIds: readonly string[]): Promise<Map<string, string>>;
  confirm(planId: string, transactionId: string): Promise<ContributionPlanLinkRow>;
  /** Atomic multi-confirm: all links persist or none do. */
  confirmMany(
    planId: string,
    transactionIds: readonly [string, string],
  ): Promise<ContributionPlanLinkRow[]>;
  reject(planId: string, transactionId: string): Promise<ContributionPlanLinkRow>;
  unlink(planId: string, transactionId: string): Promise<ContributionPlanLinkRow | null>;
}

export interface IntegrationJobRow {
  id: string;
  scheduleId: string;
  portfolioId: string;
  source: string;
  environment: string;
  scheduledFor: Date;
  status: string;
  attempt: number;
  notBeforeAt: Date | null;
  runId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationJobEnsureInput {
  id?: string;
  scheduleId: string;
  portfolioId: string;
  source: string;
  environment?: string | null;
  scheduledFor: Date;
}

export interface IIntegrationScheduleRepository {
  create(input: IntegrationScheduleCreateInput): Promise<IntegrationScheduleRow>;
  update(input: IntegrationScheduleUpdateInput): Promise<IntegrationScheduleRow>;
  touch(input: IntegrationScheduleTouchInput): Promise<IntegrationScheduleRow>;
  findById(id: string, portfolioId: string): Promise<IntegrationScheduleRow | null>;
  listByPortfolio(portfolioId: string): Promise<IntegrationScheduleRow[]>;
  listDue(now: Date, limit: number): Promise<IntegrationScheduleRow[]>;
}

export interface IIntegrationJobRepository {
  ensure(input: IntegrationJobEnsureInput): Promise<{ row: IntegrationJobRow; created: boolean }>;
  /**
   * Atomically claims one due job: flips the selected row PENDING(or stale
   * RUNNING past the lease) -> RUNNING with attempt+1. Returns null when
   * another worker won the race. Single statement, no SELECT-then-write gap.
   */
  claimDue(now: Date, leaseMs: number): Promise<IntegrationJobRow | null>;
  /**
   * Completes the job only when the caller still holds the claim: the row
   * must be RUNNING at the exact attempt the claim returned. A stale worker
   * whose claim was superseded (re-claim bumped the attempt) loses
   * explicitly instead of overwriting the new execution's terminal state.
   */
  markSucceeded(input: {
    id: string;
    portfolioId: string;
    attempt: number;
    runId: string | null;
  }): Promise<IntegrationJobRow>;
  markFailed(input: {
    id: string;
    portfolioId: string;
    attempt: number;
    errorCode: string;
    errorMessage: string;
    attemptsExhausted: boolean;
    notBeforeAt: Date | null;
  }): Promise<IntegrationJobRow>;
  /**
   * Phase 5P-D: cancels a claimed job without executing it. No run opens,
   * no ledger write, no failure recorded. Same claim fencing as completions.
   */
  markCancelled(input: {
    id: string;
    portfolioId: string;
    attempt: number;
  }): Promise<IntegrationJobRow>;
  /**
   * Newest non-terminal job for a schedule (overlap guard). A schedule with
   * a PENDING/RUNNING job never receives a second concurrent execution for
   * the same portfolio + integration.
   */
  findActiveBySchedule(scheduleId: string): Promise<IntegrationJobRow | null>;
  /**
   * Phase 5P-C: whether any job for the schedule is executing right now.
   * Read-only status signal; claiming still goes through claimDue.
   */
  hasRunningJob(scheduleId: string): Promise<boolean>;
  findById(id: string, portfolioId: string): Promise<IntegrationJobRow | null>;
  listByPortfolio(
    portfolioId: string,
    input: { limit: number; cursor?: string | null },
  ): Promise<{ rows: IntegrationJobRow[]; hasMore: boolean }>;
}

export interface IIntegrationRunRepository {
  create(input: IntegrationRunCreateInput): Promise<IntegrationRunRow>;
  /** Preview snapshot; only from STARTED. Terminal or confirmed runs reject. */
  recordPreview(input: IntegrationRunPreviewInput): Promise<IntegrationRunRow>;
  /** Confirmation outcome; only from AWAITING_REVIEW or CONFIRMING. */
  recordConfirmation(input: IntegrationRunConfirmationInput): Promise<IntegrationRunRow>;
  /** Failure outcome; only from non-terminal runs. */
  recordFailure(input: IntegrationRunFailureInput): Promise<IntegrationRunRow>;
  /** Idempotent linkage of confirmed canonical transactions to a run. */
  linkTransactions(input: IntegrationRunLinkInput): Promise<number>;
  /** Transaction ids confirmed by a run, in linkage order. */
  listTransactionIdsByRun(runId: string, portfolioId: string): Promise<string[]>;
  /**
   * Phase 5S-B-R2 — bounded link counts for workflow derivation.
   * One GROUP BY instead of one query per run.
   */
  countLinksByRunIds(
    runIds: string[],
    portfolioId: string,
  ): Promise<Array<{ runId: string; count: number }>>;
  findById(id: string, portfolioId: string): Promise<IntegrationRunRow | null>;
  /**
   * Phase 5P-B: ownership-scoped lookup across a user's portfolios.
   * Returns null when the run does not belong to any of them (the service
   * maps null to 404 anti-enumeration, never 403).
   */
  findByIdInPortfolios(id: string, portfolioIds: string[]): Promise<IntegrationRunRow | null>;
  /**
   * Phase 5P-B: newest-first listing across portfolios for the derived
   * review inbox. The cursor is a resolved anchor row (already
   * ownership-checked by the service); forged ids never reach this layer.
   */
  listByPortfolioIds(
    portfolioIds: string[],
    input: { limit: number; cursor?: IntegrationRunRow | null },
  ): Promise<{ rows: IntegrationRunRow[]; hasMore: boolean }>;
  /**
   * Phase 5P-B: bounded newest-first window across portfolios for the
   * pending-count badge. Never a full-history scan.
   */
  listRecentByPortfolioIds(portfolioIds: string[], limit: number): Promise<IntegrationRunRow[]>;
  listByPortfolio(
    portfolioId: string,
    input: { limit: number; cursor?: string | null },
  ): Promise<{ rows: IntegrationRunRow[]; hasMore: boolean }>;
  /**
   * Phase 5S-E — bounded read for operational activity feed with timestamp cursor.
   */
  listForAudit(
    portfolioId: string,
    options: {
      limit: number;
      cursor?: { completedAt?: Date; createdAt?: Date } | null;
    },
  ): Promise<IntegrationRunRow[]>;
  countByPortfolio(portfolioId: string): Promise<number>;
}

export type ReconciliationDecisionKind = 'CONFIRM_MATCH' | 'NOT_A_MATCH';
export interface ReconciliationDecisionRow {
  id: string;
  portfolioId: string;
  integrationRunId: string;
  source: string;
  sourceItemKey: string;
  localTransactionId: string;
  decision: ReconciliationDecisionKind;
  decidedByPrincipal: string;
  decidedAt: Date;
  createdAt: Date;
}

export interface ReconciliationDecisionCreateInput {
  portfolioId: string;
  integrationRunId: string;
  source: string;
  sourceItemKey: string;
  localTransactionId: string;
  decision: ReconciliationDecisionKind;
  decidedByPrincipal: string;
  decidedAt: Date;
}

/**
 * Phase 5S-B-R1 — human reconciliation decisions. Append-only: create
 * plus scoped reads. No update, no delete, no transaction writes.
 */
export interface IReconciliationDecisionRepository {
  create(input: ReconciliationDecisionCreateInput): Promise<ReconciliationDecisionRow>;
  findByIdentity(
    portfolioId: string,
    integrationRunId: string,
    sourceItemKey: string,
    localTransactionId: string,
  ): Promise<ReconciliationDecisionRow | null>;
  listByRun(runId: string, portfolioId: string): Promise<ReconciliationDecisionRow[]>;
  /**
   * Phase 5S-B-R2 — one bounded read for workflow derivation across a
   * review window. Never per-run/per-item calls.
   */
  listByRunIds(runIds: string[], portfolioId: string): Promise<ReconciliationDecisionRow[]>;
  /**
   * Phase 5S-E — bounded read for operational activity feed.
   */
  listByPortfolio(
    portfolioId: string,
    options: {
      limit: number;
      cursor?: { decidedAt: Date } | null;
    },
  ): Promise<ReconciliationDecisionRow[]>;
}

export type RectificationMode = 'RECTIFY' | 'CANCEL';

export interface TransactionRectificationRow {
  id: string;
  portfolioId: string;
  originalTransactionId: string;
  compensatingTransactionId: string;
  replacementTransactionId: string | null;
  mode: RectificationMode;
  reason: string;
  decidedByPrincipal: string;
  decidedAt: Date;
  createdAt: Date;
}

export interface TransactionRectificationLinkInput {
  portfolioId: string;
  originalTransactionId: string;
  compensatingTransactionId: string;
  replacementTransactionId: string | null;
  mode: RectificationMode;
  reason: string;
  decidedByPrincipal: string;
  decidedAt: Date;
}

/**
 * Phase 5S-C — append-only transaction rectifications.
 *
 * Identity + audit only: one row per original transaction. No update,
 * no delete, no transaction rewrites — the ledger stays append-only.
 */
export interface ITransactionRectificationRepository {
  createWithTransactions(input: {
    transactions: Transaction[];
    link: TransactionRectificationLinkInput;
  }): Promise<{ transactions: Transaction[]; record: TransactionRectificationRow }>;
  findByOriginalTransactionId(
    originalTransactionId: string,
    portfolioId: string,
  ): Promise<TransactionRectificationRow | null>;
  findByReplacementTransactionId(
    replacementTransactionId: string,
    portfolioId: string,
  ): Promise<TransactionRectificationRow | null>;
  listByOriginalTransactionIds(
    originalTransactionIds: string[],
    portfolioId: string,
  ): Promise<TransactionRectificationRow[]>;
  /**
   * Phase 5S-C — bounded reverse lookup for CORRECTION badges and chain
   * building. One query for a whole page, never per item.
   */
  listByReplacementTransactionIds(
    replacementTransactionIds: string[],
    portfolioId: string,
  ): Promise<TransactionRectificationRow[]>;
  /**
   * Phase 5S-E — bounded read for operational activity feed.
   */
  listByPortfolio(
    portfolioId: string,
    options: {
      limit: number;
      cursor?: { decidedAt: Date } | null;
    },
  ): Promise<TransactionRectificationRow[]>;
  /**
   * Follows the append-only chain (A → B → C) to the terminal node.
   * Returns null for cancelled terminals (no replacement) or corrupt
   * cycles. Used for navigation and "already rectified" answers —
   * never to rewrite history.
   */
  resolveEffectiveTransactionId(
    originalTransactionId: string,
    portfolioId: string,
  ): Promise<string | null>;
}

// ============================================================================
// Phase 5T — Watchlist Interfaces
// ============================================================================

export interface WatchlistItemRow {
  readonly id: string;
  readonly userId: string;
  readonly assetId: string;
  readonly createdAt: Date;
  readonly asset?: {
    readonly id: string;
    readonly ticker: string;
    readonly name: string;
    readonly type: string;
    readonly currency: string;
    readonly exchange: string;
  };
}

export interface IWatchlistRepository {
  add(userId: string, assetId: string): Promise<WatchlistItemRow>;
  remove(userId: string, assetId: string): Promise<boolean>;
  listByUser(userId: string): Promise<WatchlistItemRow[]>;
  isWatched(userId: string, assetId: string): Promise<boolean>;
  findByUserAndAsset(userId: string, assetId: string): Promise<WatchlistItemRow | null>;
}

// ============================================================================
// Phase 6B — LGPD & Legal Privacy Interfaces
// ============================================================================

export type LegalDocumentType = 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY';

export interface LegalDocumentMetadata {
  readonly type: LegalDocumentType;
  readonly title: string;
  readonly version: string;
  readonly effectiveDate: string;
  readonly draftWatermark: string;
  readonly legalNotice: string;
}

export interface LegalDocumentAcceptanceRecord {
  readonly id: string;
  readonly userId: string;
  readonly documentType: string;
  readonly documentVersion: string;
  readonly acceptedAt: Date;
  readonly clientIp?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt: Date;
}

export type ConsentPurpose =
  | 'AI_GROUNDED_EXPLANATIONS'
  | 'PRODUCT_COMMUNICATIONS'
  | 'ANALYTICS_TELEMETRY'
  | 'INTEGRATION_AUTOMATION';

export interface UserConsentRecord {
  readonly id: string;
  readonly userId: string;
  readonly purpose: string;
  readonly granted: boolean;
  readonly grantedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly clientIp?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type DataSubjectRequestType =
  | 'ACCESS'
  | 'EXPORT'
  | 'CORRECTION'
  | 'DELETION'
  | 'ANONYMIZATION'
  | 'PORTABILITY'
  | 'CONSENT_REVOCATION'
  | 'SHARING_INFO';

export type DataSubjectRequestStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'REJECTED'
  | 'PENDING_LEGAL_RETENTION_REVIEW';

export interface DataSubjectRequestRecord {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly status: string;
  readonly details?: string | null;
  readonly responseNotes?: string | null;
  readonly requestedAt: Date;
  readonly completedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserDataExport {
  readonly exportedAt: string;
  readonly schemaVersion: string;
  readonly retentionNotice: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly locale: string;
    readonly timezone: string;
    readonly baseCurrency: string;
    readonly emailVerifiedAt: Date | null;
    readonly deactivatedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly portfolios: readonly {
    readonly id: string;
    readonly name: string;
    readonly baseCurrency: string;
    readonly createdAt: Date;
    readonly accounts: readonly {
      readonly id: string;
      readonly name: string;
      readonly institutionName?: string;
      readonly createdAt: Date;
    }[];
  }[];
  readonly transactionLedger: readonly {
    readonly id: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly type: string;
    readonly tradeDate: string;
    readonly settlementDate: string;
    readonly quantity: string;
    readonly unitPrice: string;
    readonly totalAmount: string;
    readonly currency: string;
    readonly ticker?: string;
    readonly assetName?: string;
  }[];
  readonly consents: readonly UserConsentRecord[];
  readonly legalAcceptances: readonly LegalDocumentAcceptanceRecord[];
  readonly dataSubjectRequests: readonly DataSubjectRequestRecord[];
  readonly watchlists: readonly {
    readonly assetId: string;
    readonly ticker?: string;
    readonly name?: string;
    readonly createdAt: Date;
  }[];
}

export interface IPrivacyRepository {
  recordAcceptance(data: {
    userId: string;
    documentType: string;
    documentVersion: string;
    clientIp?: string | null;
    userAgent?: string | null;
  }): Promise<LegalDocumentAcceptanceRecord>;

  listAcceptances(userId: string): Promise<LegalDocumentAcceptanceRecord[]>;

  getLatestAcceptance(
    userId: string,
    documentType: string,
  ): Promise<LegalDocumentAcceptanceRecord | null>;

  upsertConsent(data: {
    userId: string;
    purpose: string;
    granted: boolean;
    clientIp?: string | null;
    userAgent?: string | null;
  }): Promise<UserConsentRecord>;

  listConsents(userId: string): Promise<UserConsentRecord[]>;

  createRequest(data: {
    userId: string;
    type: string;
    details?: string | null;
    status?: string;
    responseNotes?: string | null;
  }): Promise<DataSubjectRequestRecord>;

  listRequests(userId: string): Promise<DataSubjectRequestRecord[]>;

  deactivateAccount(userId: string): Promise<{ deactivated: boolean; message: string }>;

  exportUserData(userId: string): Promise<UserDataExport>;
}

// ---------------------------------------------------------------------------
// Cost-basis evidence persistence (ADR-310, append-only revisions)
// ---------------------------------------------------------------------------

export type CostBasisEvidenceWriteOutcome = 'CREATED' | 'DUPLICATE';

export interface CostBasisEvidenceRow {
  id: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  evidenceType: string;
  source: string;
  quantityCovered: string;
  unitCost: string | null;
  totalCost: string | null;
  currency: string;
  acquisitionDate: string;
  evidenceDate: string | null;
  status: string;
  sourceReference: string;
  notes: string | null;
  version: number;
  supersedesId: string | null;
  fingerprint: string;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
}

export interface ICostBasisEvidenceRepository {
  findById(id: string): Promise<CostBasisEvidenceRow | null>;
  /** Scoped list, newest first. No N+1: single query with optional filters. */
  listByScope(input: {
    portfolioId: string;
    accountId?: string;
    assetId?: string;
    statuses?: string[];
  }): Promise<CostBasisEvidenceRow[]>;
  /**
   * Current rows per evidence stream (rows nothing supersedes). Computed
   * without mutations: a row is current when no other row in scope points
   * at it via supersedesId.
   */
  listCurrentByScope(input: {
    portfolioId: string;
    accountId?: string;
    assetId?: string;
  }): Promise<CostBasisEvidenceRow[]>;
  /**
   * Appends a revision. Identical fingerprint in scope → idempotent
   * DUPLICATE (no insert). Otherwise inserts with monotonic version
   * (parent chain length + 1) linked via supersedesId when revising.
   */
  create(input: {
    portfolioId: string;
    accountId: string;
    assetId: string;
    evidenceType: string;
    source: string;
    quantityCovered: string;
    unitCost?: string | null;
    totalCost?: string | null;
    currency: string;
    acquisitionDate: string;
    evidenceDate?: string | null;
    status: string;
    sourceReference: string;
    notes?: string | null;
    supersedesId?: string | null;
    fingerprint: string;
    confirmedBy?: string | null;
    rejectedReason?: string | null;
  }): Promise<{ outcome: CostBasisEvidenceWriteOutcome; record: CostBasisEvidenceRow }>;
}

export type PersistedNewsEventStateValue = 'NEW' | 'UPDATED' | 'SEEN' | 'UNCHANGED';

export interface PersistedPortfolioNewsSyncStateRow {
  portfolioId: string;
  newsStateInitializedAt: string | null;
  lastRefreshedAt: string | null;
}

export interface PersistedPortfolioNewsEventStateRow {
  id: string;
  portfolioId: string;
  canonicalEventId: string;
  firstSeenAt: string;
  lastObservedAt: string;
  lastSeenByUserAt: string | null;
  firstFingerprint: string;
  latestFingerprint: string;
  state: PersistedNewsEventStateValue;
  latestUpdateReasons: string[];
  eventPublishedAt: string | null;
  meta: Record<string, unknown>;
}

export interface UpsertPortfolioNewsEventStateInput {
  portfolioId: string;
  canonicalEventId: string;
  previousCanonicalEventId?: string;
  firstSeenAt: string;
  lastObservedAt: string;
  lastSeenByUserAt: string | null;
  firstFingerprint: string;
  latestFingerprint: string;
  state: PersistedNewsEventStateValue;
  latestUpdateReasons: string[];
  eventPublishedAt: string | null;
  meta: Record<string, unknown>;
}

export interface NewsAlertVersionRef {
  canonicalEventId: string;
  eventVersionFingerprint: string;
}

export interface IPortfolioNewsStateRepository {
  loadSnapshot(portfolioId: string): Promise<{
    syncState: PersistedPortfolioNewsSyncStateRow | null;
    eventStates: PersistedPortfolioNewsEventStateRow[];
  }>;

  persistSnapshot(input: {
    portfolioId: string;
    syncState: PersistedPortfolioNewsSyncStateRow;
    items: UpsertPortfolioNewsEventStateInput[];
  }): Promise<void>;

  markSeen(input: {
    portfolioId: string;
    canonicalEventIds?: string[];
    markAllNovel?: boolean;
    seenAt: string;
  }): Promise<{ updatedCount: number; updatedIds: string[] }>;

  claimPendingNewsAlerts(input: {
    portfolioId: string;
    candidates: NewsAlertVersionRef[];
    claimedAt: string;
    leaseMs?: number;
  }): Promise<{ claimed: NewsAlertVersionRef[]; skippedCount: number }>;

  confirmNewsAlertsDelivered(input: {
    portfolioId: string;
    delivered: NewsAlertVersionRef[];
    deliveredAt: string;
  }): Promise<{ confirmedCount: number }>;

  releaseNewsAlertsClaim(input: {
    portfolioId: string;
    items: NewsAlertVersionRef[];
  }): Promise<{ releasedCount: number }>;

  suppressNewsAlertsBaseline(input: {
    portfolioId: string;
    items: NewsAlertVersionRef[];
    recordedAt: string;
  }): Promise<{ suppressedCount: number }>;
}
