import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError, CrossPortfolioIntegrityError } from '@atlas/database';
import { LocalDate, serializeTransaction } from '@atlas/domain';
import type {
  IAccountRepository,
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
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
  resolveAccount,
  resolveAsset,
  summarize,
  CsvParseError,
  type AccountRef,
  type AssetRef,
  type ClassifiedCandidate,
  type ExistingLedgerRow,
  type ImportSummary,
  type NormalizedCandidate,
  type RawImportRow,
} from '@atlas/import-engine';
import { ImportValidationError } from './import-validation.error';

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
  candidates: ClassifiedCandidate[];
  summary: ImportSummary;
}

interface PipelineContext {
  provider: string;
  normalized: NormalizedCandidate[];
  assets: AssetRef[];
  accounts: AccountRef[];
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
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(command: PreviewPortfolioImportCommand): Promise<PortfolioImportPreview> {
    const context = await this.runPipeline(command);
    return this.toPreview(command, context, new Map());
  }

  async executeWithOverrides(
    command: PreviewPortfolioImportCommand,
    overrides: Map<number, ImportRowOverride>,
  ): Promise<PortfolioImportPreview> {
    const context = await this.runPipeline(command);
    return this.toPreview(command, context, overrides);
  }

  private async runPipeline(command: PreviewPortfolioImportCommand): Promise<PipelineContext> {
    if (!SUPPORTED_IMPORT_SOURCES.includes(command.sourceType as 'GENERIC_CSV')) {
      throw new ImportValidationError(
        `Fonte "${command.sourceType}" ainda não suportada. Envie um arquivo CSV no modelo Atlas.`,
      );
    }

    const portfolio = await this.portfolioRepository.findById(command.portfolioId);
    if (!portfolio || (command.userId && portfolio.userId !== command.userId)) {
      throw new EntityNotFoundError('Portfolio', command.portfolioId);
    }

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
    const normalized = rows.map((row) => normalizeRow(row, mapping, { today }));

    const provider = normalizeProvider(
      !command.provider || command.provider.trim() === '' ? 'CSV' : command.provider,
    );

    const [assets, accounts] = await Promise.all([
      this.assetRepository.list(),
      this.accountRepository.findByPortfolioId(command.portfolioId),
    ]);

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
      accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
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
      const accountMatch =
        explicitAccount !== null
          ? {
              resolution: 'RESOLVED' as const,
              account: explicitAccount,
              candidates: [] as AccountRef[],
            }
          : resolveAccount(candidate.accountLabel, context.accounts);

      return classifyOne({
        portfolioId: command.portfolioId,
        provider: context.provider,
        candidate,
        assetMatch,
        accountMatch,
        defaultAccountId: context.defaultAccountId,
        existing: context.existing,
      });
    });

    return {
      sourceType: 'GENERIC_CSV',
      provider: context.provider,
      fileName: command.fileName,
      candidates,
      summary: summarize(candidates),
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
