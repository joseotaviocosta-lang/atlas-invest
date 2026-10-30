import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError, CrossPortfolioIntegrityError } from '@atlas/database';
import { LocalDate, serializeTransaction, Asset, type Transaction } from '@atlas/domain';
import type {
  IAccountRepository,
  IAssetRepository,
  IInstitutionRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
  INSTITUTION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { FISCAL_CLOCK } from '../fiscal/tokens';
import type { FiscalClock } from '../fiscal/fiscal-clock';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  SUPPORTED_IMPORT_SOURCES,
  canonicalConversionFingerprint,
  canonicalFingerprint,
  classifyOne,
  mapHeaders,
  normalizeRow,
  normalizeProvider,
  parseCsv,
  detectB3XlsxLayout,
  parseB3NegotiationXlsx,
  parseB3AnnualReportXlsx,
  parseB3MovementXlsx,
  applyMovementLedgerGates,
  applyPreBaselineSnapshotGate,
  B3XlsxParseError,
  resolveAccount,
  resolveAsset,
  inferB3Asset,
  normalizeB3InstitutionName,
  matchAccountForB3Institution,
  summarize,
  CsvParseError,
  type AccountRef,
  type AssetMatch,
  type AssetRef,
  type B3LayoutType,
  type ClassifiedCandidate,
  type ExistingLedgerRow,
  type ImportSummary,
  type MovementNotice,
  type NormalizedCandidate,
  type RawImportRow,
  type UniqueAssetSummary,
  type UniqueInstitutionSummary,
} from '@atlas/import-engine';
import { ImportValidationError } from './import-validation.error';
import { IntegrationRunService } from './integration-run.service';

export interface PreviewPortfolioImportCommand {
  portfolioId: string;
  userId: string;
  sourceType: string;
  provider?: string;
  fileName: string;
  content: string;
  defaultAccountId?: string;
}

export interface ImportRowOverride {
  assetId?: string;
  accountId?: string;
}

export interface PortfolioImportPreview {
  sourceType: string;
  provider: string;
  fileName: string;
  /** Operational run tracking this preview. Null on internal re-previews. */
  runId: string | null;
  candidates: ClassifiedCandidate[];
  /**
   * Phase R1 — non-ledger movement notices (cash-only, informational,
   * review-required). Display-only: confirm ignores notices structurally,
   * so they can never reach the ledger (PART P: no mass import).
   */
  notices: MovementNotice[];
  /**
   * Hotfix B1 — the layout the server actually detected by inspecting the
   * file bytes (source of truth for parsing AND safety gates). The declared
   * client sourceType is only a hint and must never disable gates.
   * Null for CSV flows (no layout inspection).
   */
  detectedLayout: B3LayoutType | null;
  /** Human-readable detected format name for honest UI labeling. */
  detectedName: string | null;
  summary: ImportSummary;
  assetSummary?: UniqueAssetSummary[];
  institutionSummary?: UniqueInstitutionSummary[];
}

interface PipelineContext {
  provider: string;
  normalized: NormalizedCandidate[];
  notices: MovementNotice[];
  detectedLayout: B3LayoutType | null;
  detectedName: string | null;
  assets: AssetRef[];
  accounts: AccountRef[];
  institutions: Array<{ id: string; name: string }>;
  defaultAccountId: string | null;
  existing: ExistingLedgerRow[];
}

const TEXT_ENCODER = new TextEncoder();

/**
 * Direct ticker-to-asset resolution for receipt-conversion targets.
 * Successor fallback is deliberately NOT consulted: the target is a distinct
 * instrument receiving carried cost, never a renamed symbol (PART AD).
 */
function resolveConversionTarget(ticker: string, assets: AssetRef[]): AssetMatch {
  const normalized = ticker.trim().toUpperCase();
  const matches = assets.filter((asset) => asset.ticker.trim().toUpperCase() === normalized);
  if (matches.length === 0) {
    return { resolution: 'NOT_FOUND', asset: null, candidates: [], viaSuccessor: false };
  }
  const active = matches.filter((asset) => asset.status === 'ACTIVE');
  const pool = active.length > 0 ? active : matches;
  if (pool.length === 1) {
    return { resolution: 'RESOLVED', asset: pool[0]!, candidates: [], viaSuccessor: false };
  }
  return { resolution: 'AMBIGUOUS', asset: null, candidates: [...pool], viaSuccessor: false };
}

@Injectable()
export class PreviewPortfolioImportUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutionRepository: IInstitutionRepository,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
    @Inject(IntegrationRunService)
    private readonly runService: IntegrationRunService,
  ) {}

  async execute(command: PreviewPortfolioImportCommand): Promise<PortfolioImportPreview> {
    const context = await this.runPipeline(command);
    const preview = this.toPreview(command, context, new Map());
    // Phase 5P-PRE: every user-facing preview opens an operational run.
    // Run metadata only — the canonical Transaction ledger is untouched here.
    const probable = preview.candidates.filter(
      (candidate) => candidate.duplicate === 'PROBABLE_DUPLICATE',
    ).length;
    const conflicts = preview.candidates.filter(
      (candidate) => candidate.duplicate === 'CONFLICT',
    ).length;
    const isB3 =
      command.sourceType === 'B3_NEGOTIATION_XLSX' ||
      command.sourceType === 'B3_ANNUAL_REPORT_XLSX' ||
      command.sourceType === 'B3_MOVEMENT_XLSX' ||
      context.provider.includes('B3');
    const run = await this.runService.startRun({
      portfolioId: command.portfolioId,
      userId: command.userId,
      source: isB3 ? 'B3' : 'CSV',
      provider: context.provider,
      fileName: command.fileName,
      trigger: 'MANUAL',
    });
    await this.runService.recordPreview({
      runId: run.id,
      portfolioId: command.portfolioId,
      userId: command.userId,
      recordsFetched: context.normalized.length,
      recordsNormalized: preview.summary.totalRows,
      newCandidates: preview.summary.ready,
      exactDuplicates: preview.summary.duplicates,
      probableDuplicates: probable,
      conflicts,
      unsupported: preview.summary.unsupported,
      invalid: preview.summary.invalid,
    });
    return { ...preview, runId: run.id };
  }

  async executeWithOverrides(
    command: PreviewPortfolioImportCommand,
    overrides: Map<number, ImportRowOverride>,
  ): Promise<PortfolioImportPreview> {
    const context = await this.runPipeline(command);
    const preview = this.toPreview(command, context, overrides);
    // Internal re-preview (confirm path): no new run, no ledger writes.
    return { ...preview, runId: null };
  }

  private async runPipeline(command: PreviewPortfolioImportCommand): Promise<PipelineContext> {
    if (
      !SUPPORTED_IMPORT_SOURCES.includes(
        command.sourceType as (typeof SUPPORTED_IMPORT_SOURCES)[number],
      )
    ) {
      throw new ImportValidationError(
        `Fonte "${command.sourceType}" ainda não suportada. Envie um arquivo CSV no modelo Atlas ou XLSX da B3.`,
      );
    }

    const portfolio = await this.portfolioRepository.findById(command.portfolioId);
    if (!portfolio || (command.userId && portfolio.userId !== command.userId)) {
      throw new EntityNotFoundError('Portfolio', command.portfolioId);
    }

    let normalized: NormalizedCandidate[];
    let movementNotices: MovementNotice[] = [];
    let defaultProviderName = 'CSV';
    // Hotfix B1 — detected layout is the source of truth for parsing AND
    // safety gates. Declared sourceType is only a client hint.
    let detectedLayout: B3LayoutType | null = null;
    let detectedName: string | null = null;

    if (
      command.sourceType === 'B3_NEGOTIATION_XLSX' ||
      command.sourceType === 'B3_ANNUAL_REPORT_XLSX' ||
      command.sourceType === 'B3_MOVEMENT_XLSX'
    ) {
      const buffer = Buffer.from(command.content, 'base64');
      if (buffer.length > MAX_IMPORT_BYTES) {
        throw new ImportValidationError(
          `Arquivo excede o limite de ${MAX_IMPORT_BYTES / 1024 / 1024} MB por importação.`,
        );
      }

      const detection = await detectB3XlsxLayout(buffer);
      if (!detection.isB3 || !detection.isSupported) {
        throw new ImportValidationError(
          detection.reason ?? 'Arquivo Excel não reconhecido como formato oficial da B3.',
        );
      }
      detectedLayout = detection.layout;
      detectedName = detection.detectedName;

      try {
        if (detection.layout === 'B3_NEGOTIATION') {
          normalized = await parseB3NegotiationXlsx(buffer, {
            today: this.clock.today(),
            maxRows: MAX_IMPORT_ROWS,
          });
        } else if (detection.layout === 'B3_ANNUAL_REPORT') {
          normalized = await parseB3AnnualReportXlsx(buffer, {
            fileName: command.fileName,
            maxRows: MAX_IMPORT_ROWS,
          });
        } else if (detection.layout === 'B3_MOVEMENT') {
          const mapped = await parseB3MovementXlsx(buffer, {
            fileName: command.fileName,
            today: this.clock.today(),
            maxRows: MAX_IMPORT_ROWS,
          });
          normalized = [...mapped.candidates];
          movementNotices = [...mapped.notices];
        } else {
          throw new ImportValidationError(
            `Layout B3 "${detection.detectedName}" ainda não é suportado para importação.`,
          );
        }
      } catch (error: unknown) {
        if (error instanceof B3XlsxParseError) {
          throw new ImportValidationError(error.message);
        }
        throw error;
      }
      defaultProviderName = 'B3';
    } else {
      if (TEXT_ENCODER.encode(command.content).length > MAX_IMPORT_BYTES) {
        throw new ImportValidationError(
          `Arquivo excede o limite de ${MAX_IMPORT_BYTES / 1024 / 1024} MB por importação.`,
        );
      }

      let headers: string[];
      let rawRows: string[][];
      try {
        const parsed = parseCsv(command.content, MAX_IMPORT_ROWS);
        headers = parsed.headers;
        rawRows = parsed.rows;
      } catch (error: unknown) {
        if (error instanceof CsvParseError) {
          throw new ImportValidationError(error.message);
        }
        throw error;
      }

      const { mapping, missing } = mapHeaders(headers);
      if (missing.length > 0) {
        throw new ImportValidationError(
          `Colunas obrigatórias ausentes: ${missing.join(', ')}. Use o modelo Atlas (data, ativo, operação, quantidade).`,
        );
      }

      const today = this.clock.today();
      const rows: RawImportRow[] = rawRows.map((cells, index) => ({
        rowNumber: index + 2,
        cells: Object.fromEntries(cells.map((value, cellIndex) => [String(cellIndex), value])),
      }));
      normalized = rows.map((row) => normalizeRow(row, mapping, { today }));
    }

    const provider = normalizeProvider(
      !command.provider || command.provider.trim() === '' ? defaultProviderName : command.provider,
    );

    const [assets, accounts, institutions] = await Promise.all([
      this.assetRepository.list(),
      this.accountRepository.findByPortfolioId(command.portfolioId),
      this.institutionRepository.list(),
    ]);

    // Phase 5K Auto-Resolution: auto-provision known / unambiguous B3 assets into AssetRepository
    // Metadata-only persistence: ledger delta remains strictly 0 (no financial transactions).
    const uniqueTickers = Array.from(
      new Set(normalized.map((c) => c.ticker.trim().toUpperCase())),
    ).filter(Boolean);

    const existingByTicker = new Map(
      assets.map((a) => [a.ticker.trim().toUpperCase(), a]),
    );

    for (const ticker of uniqueTickers) {
      if (!existingByTicker.has(ticker)) {
        const ref = inferB3Asset(ticker);
        if (ref) {
          try {
            const newAsset = Asset.create({
              ticker: ref.ticker,
              name: ref.name,
              type: ref.type,
              currency: ref.currency,
              exchange: ref.exchange,
            });
            const created = await this.assetRepository.create(newAsset);
            assets.push(created);
            existingByTicker.set(ticker, created);
          } catch {
            // Concurrency or already existing fallback
          }
        }
      }
    }

    if (command.defaultAccountId) {
      const fallback = accounts.find((account) => account.id === command.defaultAccountId);
      if (!fallback) {
        const existingAccount = await this.accountRepository.findById(command.defaultAccountId);
        if (existingAccount) {
          throw new CrossPortfolioIntegrityError(
            `Account '${command.defaultAccountId}' belongs to portfolio '${existingAccount.portfolioId}', not '${command.portfolioId}'`,
          );
        }
        throw new EntityNotFoundError('Account', command.defaultAccountId);
      }
    }

    const dated = normalized.filter(
      (candidate) => candidate.status !== 'INVALID' && candidate.tradeDate !== '',
    );
    const tradeDates = dated.map((candidate) => candidate.tradeDate).sort();
    // Phase R1 — movement ledger gates (settlement shadows, pre-baseline
    // snapshot cover) need the FULL ledger history, including 2024 opening
    // legs that fall outside the file's own date window. Keyed on DETECTED
    // layout (hotfix B1): a misdeclared client sourceType must never shrink
    // the history window nor skip gates. Negotiation previews need the same
    // full history for the shared pre-baseline gate (a narrow dated file
    // must not blind the snapshot-coverage check). Other sources keep the
    // bounded query.
    const existing =
      detectedLayout === 'B3_MOVEMENT' || detectedLayout === 'B3_NEGOTIATION'
        ? await this.loadFullLedger(command.portfolioId)
        : await this.loadExistingLedger(
            command.portfolioId,
            tradeDates[0],
            tradeDates[tradeDates.length - 1],
          );

    return {
      provider,
      normalized,
      notices: movementNotices,
      detectedLayout,
      detectedName,
      assets: assets.map((asset) => ({
        id: asset.id,
        ticker: asset.ticker,
        exchange: asset.exchange,
        status: asset.status,
      })),
      accounts: accounts.map((account) => {
        const inst = institutions.find((i) => i.id === account.institutionId);
        return {
          id: account.id,
          name: account.name,
          institutionId: account.institutionId,
          institutionName: inst?.name,
        };
      }),
      institutions: institutions.map((i) => ({ id: i.id, name: i.name })),
      defaultAccountId: command.defaultAccountId ?? null,
      existing,
    };
  }

  private toPreview(
    command: PreviewPortfolioImportCommand,
    context: PipelineContext,
    overrides: Map<number, ImportRowOverride>,
  ): PortfolioImportPreview {
    const assetsById = new Map(context.assets.map((asset) => [asset.id, asset]));
    const accountsById = new Map(context.accounts.map((account) => [account.id, account]));

    const candidates = context.normalized.map((candidate) => {
      const override = overrides.get(candidate.rowNumber);
      const overridable = candidate.status !== 'INVALID' && candidate.status !== 'UNSUPPORTED';
      const explicitAsset =
        override?.assetId && overridable ? (assetsById.get(override.assetId) ?? null) : null;
      const explicitAccount =
        override?.accountId && overridable ? (accountsById.get(override.accountId) ?? null) : null;

      if (override?.assetId && explicitAsset === null && overridable) {
        throw new EntityNotFoundError('Asset', override.assetId);
      }
      if (override?.accountId && explicitAccount === null && overridable) {
        throw new EntityNotFoundError('Account', override.accountId);
      }

      const assetMatch =
        explicitAsset !== null
          ? { resolution: 'RESOLVED' as const, asset: explicitAsset, candidates: [] as AssetRef[], viaSuccessor: false }
          : resolveAsset(candidate.ticker, context.assets);

      // Receipt-conversion targets resolve by DIRECT ticker match only.
      // Successor fallback is deliberately bypassed: a conversion is a
      // corporate event between two distinct instruments, never a rename
      // (PART AD). An unresolvable target stays NEEDS_REVIEW.
      const targetAssetMatch =
        candidate.operation === 'RECEIPT_CONVERSION' && candidate.targetTicker
          ? resolveConversionTarget(candidate.targetTicker, context.assets)
          : undefined;

      let accountMatch: {
        resolution: 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'UNSPECIFIED';
        account: AccountRef | null;
        candidates: AccountRef[];
      };

      if (explicitAccount !== null) {
        accountMatch = {
          resolution: 'RESOLVED',
          account: explicitAccount,
          candidates: [],
        };
      } else if (
        command.sourceType === 'B3_NEGOTIATION_XLSX' ||
        command.sourceType === 'B3_ANNUAL_REPORT_XLSX' ||
        command.sourceType === 'B3_MOVEMENT_XLSX' ||
        candidate.accountLabel ||
        candidate.brokerLabel
      ) {
        // Deterministic B3 Institution to Account resolution
        const instLabel =
          candidate.normalizedInstitution?.trim() ||
          candidate.brokerLabel?.trim() ||
          candidate.accountLabel?.trim();
        const matched = matchAccountForB3Institution(
          instLabel,
          context.accounts,
          context.institutions,
        );
        accountMatch = {
          resolution: matched.resolution,
          account: matched.account,
          candidates: matched.candidates,
        };
      } else {
        accountMatch = resolveAccount(candidate.accountLabel, context.accounts);
      }

      const classified = classifyOne({
        portfolioId: command.portfolioId,
        provider: context.provider,
        candidate,
        assetMatch,
        targetAssetMatch,
        accountMatch,
        defaultAccountId: context.defaultAccountId,
        existing: context.existing,
      });

      const instLabel = candidate.accountLabel?.trim() || candidate.brokerLabel?.trim();
      const normalizedInstitution =
        candidate.normalizedInstitution ??
        (instLabel ? normalizeB3InstitutionName(instLabel) : undefined);

      return {
        ...classified,
        normalizedInstitution,
      };
    });

    // Phase R1 — movement ledger gates run post-classification (they need
    // resolved assetId/accountId plus full existing history). Downgrades only:
    // shadows and loan-state become UNSUPPORTED, pre-baseline trades become
    // NEEDS_REVIEW. Nothing here can promote a row to READY.
    // Hotfix B1: keyed on DETECTED layout, never on declared sourceType.
    // Negotiation flows run the shared pre-baseline snapshot gate so
    // pre-opening trades (KCRE11-shaped) cannot slip in silently; eligible
    // rows are flagged for the owner-reviewed unsettled-trade exception.
    const gated =
      context.detectedLayout === 'B3_MOVEMENT'
        ? applyMovementLedgerGates({ candidates, existing: context.existing })
        : context.detectedLayout === 'B3_NEGOTIATION'
          ? applyPreBaselineSnapshotGate({ candidates, existing: context.existing })
          : candidates;

    // Unique Asset Summary
    const assetSummaryMap = new Map<string, UniqueAssetSummary>();
    for (const candidate of gated) {
      const ticker = candidate.ticker.trim().toUpperCase();
      const existing = assetSummaryMap.get(ticker);
      if (existing) {
        existing.rowCount += 1;
      } else {
        const asset = context.assets.find((a) => a.ticker.toUpperCase() === ticker);
        assetSummaryMap.set(ticker, {
          ticker,
          rowCount: 1,
          assetId: candidate.assetId,
          status:
            candidate.assetResolution === 'RESOLVED'
              ? 'RESOLVED'
              : candidate.assetResolution === 'AMBIGUOUS'
                ? 'AMBIGUOUS'
                : 'NEEDS_MAPPING',
          name: asset ? (asset as { name?: string }).name : undefined,
          type: asset ? (asset as { type?: string }).type : undefined,
        });
      }
    }
    const assetSummary = Array.from(assetSummaryMap.values()).sort((a, b) =>
      a.ticker.localeCompare(b.ticker),
    );

    // Unique Institution Summary (grouped by normalized institution name)
    const institutionSummaryMap = new Map<
      string,
      {
        summary: UniqueInstitutionSummary;
        tickers: Set<string>;
        rawNames: Set<string>;
      }
    >();

    for (const candidate of gated) {
      const rawName =
        candidate.accountLabel?.trim() || candidate.brokerLabel?.trim() || 'Não identificada';
      const normalizedName = candidate.normalizedInstitution || normalizeB3InstitutionName(rawName);
      const ticker = candidate.ticker?.trim().toUpperCase();

      const existing = institutionSummaryMap.get(normalizedName);
      if (existing) {
        existing.summary.rowCount += 1;
        existing.summary.operationCount += 1;
        if (ticker) existing.tickers.add(ticker);
        existing.rawNames.add(rawName.toLowerCase());
        if (!existing.summary.matchedAccountId && candidate.accountId) {
          const matchedAccount = context.accounts.find((a) => a.id === candidate.accountId);
          existing.summary.matchedAccountId = candidate.accountId;
          existing.summary.matchedAccountName = matchedAccount?.name ?? null;
          existing.summary.status = 'RESOLVED';
        }
      } else {
        const instCatalog = context.institutions.find(
          (i) =>
            i.name.toLowerCase() === normalizedName.toLowerCase() ||
            normalizeB3InstitutionName(i.name).toLowerCase() === normalizedName.toLowerCase(),
        );
        const matchedAccount = candidate.accountId
          ? context.accounts.find((a) => a.id === candidate.accountId)
          : null;
        const tickers = new Set<string>();
        if (ticker) tickers.add(ticker);
        const rawNames = new Set<string>();
        rawNames.add(rawName.toLowerCase());

        institutionSummaryMap.set(normalizedName, {
          summary: {
            rawName,
            normalizedName,
            institutionId: instCatalog?.id ?? null,
            matchedAccountId: candidate.accountId ?? null,
            matchedAccountName: matchedAccount?.name ?? null,
            rowCount: 1,
            operationCount: 1,
            uniqueAssetCount: 1,
            status: candidate.accountId ? 'RESOLVED' : 'NEEDS_ACCOUNT',
          },
          tickers,
          rawNames,
        });
      }
    }

    const institutionSummary = Array.from(institutionSummaryMap.values())
      .map((entry) => {
        entry.summary.uniqueAssetCount = entry.tickers.size;
        entry.summary.rawNames = Array.from(entry.rawNames);
        return entry.summary;
      })
      .sort((a, b) => b.operationCount - a.operationCount);

    return {
      sourceType: command.sourceType,
      provider: context.provider,
      fileName: command.fileName,
      // Run linkage is set by execute() (user-facing preview); internal
      // re-previews resolve it to null.
      runId: null,
      candidates: gated,
      notices: context.notices,
      detectedLayout: context.detectedLayout,
      detectedName: context.detectedName,
      summary: summarize(gated),
      assetSummary,
      institutionSummary,
    };
  }

  private async loadFullLedger(portfolioId: string): Promise<ExistingLedgerRow[]> {
    const transactions = await this.transactionRepository.findByPortfolioId(portfolioId);
    return transactions.map((transaction) => this.toExistingRow(transaction));
  }

  private toExistingRow(transaction: Transaction): ExistingLedgerRow {
    const json = serializeTransaction(transaction);
    const isConversion = json.type === 'RECEIPT_CONVERSION';
    return {
      provider: json.provider ?? null,
      externalId: json.externalId ?? null,
      assetId: json.assetId ?? '',
      targetAssetId: json.targetAssetId ?? null,
      accountId: json.accountId,
      type: json.type,
      tradeDate: json.tradeDate,
      quantity: json.quantity ?? '',
      targetQuantity: json.targetQuantity ?? null,
      conversionRatio: json.conversionRatio ?? null,
      conversionType: json.conversionType ?? null,
      unitPrice: json.unitPrice?.amount ?? null,
      fees: json.fees?.amount ?? null,
      // Phase 5O-A: income rows carry the credited value; trades carry null.
      amount: json.amount?.amount ?? null,
      currency: json.currency,
      fingerprint: isConversion
        ? canonicalConversionFingerprint({
            portfolioId: json.portfolioId,
            accountId: json.accountId,
            assetId: json.assetId ?? '',
            targetAssetId: json.targetAssetId ?? '',
            type: json.type,
            tradeDate: json.tradeDate,
            quantity: json.quantity ?? '',
            targetQuantity: json.targetQuantity ?? '',
            conversionRatio: json.conversionRatio ?? '',
            conversionType: json.conversionType ?? '',
            currency: json.currency,
          })
        : canonicalFingerprint({
            portfolioId: json.portfolioId,
            accountId: json.accountId,
            assetId: json.assetId ?? '',
            type: json.type,
            tradeDate: json.tradeDate,
            quantity: json.quantity ?? '',
            unitPrice: json.unitPrice?.amount ?? null,
            fees: json.fees?.amount ?? null,
            currency: json.currency,
          }),
    };
  }

  private async loadExistingLedger(
    portfolioId: string,
    startDate: string | undefined,
    endDate: string | undefined,
  ): Promise<ExistingLedgerRow[]> {
    if (!startDate || !endDate) return [];
    const transactions = await this.transactionRepository.findByPortfolioId(portfolioId, {
      startDate: LocalDate.from(startDate),
      endDate: LocalDate.from(endDate),
    });
    return transactions.map((transaction) => this.toExistingRow(transaction));
  }
}
