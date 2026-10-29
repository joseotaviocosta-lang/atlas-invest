import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError, CrossPortfolioIntegrityError } from '@atlas/database';
import { LocalDate, serializeTransaction, Asset } from '@atlas/domain';
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
  canonicalFingerprint,
  classifyOne,
  mapHeaders,
  normalizeRow,
  normalizeProvider,
  parseCsv,
  detectB3XlsxLayout,
  parseB3NegotiationXlsx,
  B3XlsxParseError,
  resolveAccount,
  resolveAsset,
  inferB3Asset,
  normalizeB3InstitutionName,
  matchAccountForB3Institution,
  summarize,
  CsvParseError,
  type AccountRef,
  type AssetRef,
  type ClassifiedCandidate,
  type ExistingLedgerRow,
  type ImportSummary,
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
  summary: ImportSummary;
  assetSummary?: UniqueAssetSummary[];
  institutionSummary?: UniqueInstitutionSummary[];
}

interface PipelineContext {
  provider: string;
  normalized: NormalizedCandidate[];
  assets: AssetRef[];
  accounts: AccountRef[];
  institutions: Array<{ id: string; name: string }>;
  defaultAccountId: string | null;
  existing: ExistingLedgerRow[];
}

const TEXT_ENCODER = new TextEncoder();

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
    const isB3 = command.sourceType === 'B3_NEGOTIATION_XLSX' || context.provider.includes('B3');
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
    let defaultProviderName = 'CSV';

    if (command.sourceType === 'B3_NEGOTIATION_XLSX') {
      const buffer = Buffer.from(command.content, 'base64');
      if (buffer.length > MAX_IMPORT_BYTES) {
        throw new ImportValidationError(
          `Arquivo excede o limite de ${MAX_IMPORT_BYTES / 1024 / 1024} MB por importação.`,
        );
      }

      const detection = await detectB3XlsxLayout(buffer);
      if (!detection.isB3 || detection.layout !== 'B3_NEGOTIATION') {
        throw new ImportValidationError(
          detection.reason ?? 'Arquivo Excel não reconhecido como formato oficial da B3.',
        );
      }

      try {
        normalized = await parseB3NegotiationXlsx(buffer, {
          today: this.clock.today(),
          maxRows: MAX_IMPORT_ROWS,
        });
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
    const existing = await this.loadExistingLedger(
      command.portfolioId,
      tradeDates[0],
      tradeDates[tradeDates.length - 1],
    );

    return {
      provider,
      normalized,
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
          ? { resolution: 'RESOLVED' as const, asset: explicitAsset, candidates: [] as AssetRef[] }
          : resolveAsset(candidate.ticker, context.assets);

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
      } else if (command.sourceType === 'B3_NEGOTIATION_XLSX' || candidate.accountLabel || candidate.brokerLabel) {
        // Deterministic B3 Institution to Account resolution
        const instLabel = candidate.accountLabel?.trim() || candidate.brokerLabel?.trim();
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

    // Unique Asset Summary
    const assetSummaryMap = new Map<string, UniqueAssetSummary>();
    for (const candidate of candidates) {
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

    for (const candidate of candidates) {
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
      candidates,
      summary: summarize(candidates),
      assetSummary,
      institutionSummary,
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
    return transactions.map((transaction) => {
      const json = serializeTransaction(transaction);
      return {
        provider: json.provider ?? null,
        externalId: json.externalId ?? null,
        assetId: json.assetId ?? '',
        accountId: json.accountId,
        type: json.type,
        tradeDate: json.tradeDate,
        quantity: json.quantity ?? '',
        unitPrice: json.unitPrice?.amount ?? null,
        fees: json.fees?.amount ?? null,
        // Phase 5O-A: income rows carry the credited value; trades carry null.
        amount: json.amount?.amount ?? null,
        currency: json.currency,
        fingerprint: canonicalFingerprint({
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
    });
  }
}
