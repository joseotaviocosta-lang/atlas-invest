import { Inject, Injectable } from '@nestjs/common';
import { serializeTransaction } from '@atlas/domain';
import type {
  IAccountRepository,
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  canonicalConversionFingerprint,
  canonicalFingerprint,
  civilDateInTimezone,
  runSimulatedB3Sync,
  SimulatedB3Provider,
  SimulatedB3SyncBlockedError,
  type ExistingLedgerRow,
} from '@atlas/import-engine';
import {
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { GetPortfolioStateUseCase } from '../portfolios/get-portfolio-state.use-case';
import { IntegrationRunService } from './integration-run.service';
import { ScheduledSyncFailedError } from './integration-scheduling.tokens';

export interface ScheduledSyncContext {
  jobId: string;
  attempt: number;
  scheduleId: string;
  portfolioId: string;
  source: string;
  timezone: string;
  now: Date;
}

export type ScheduledSyncFreshness = 'FRESH' | 'NO_NEW_DATA';

export interface ScheduledSyncResult {
  runId: string;
  /** Phase 5P-A: background sync is preview-only. Always 0. */
  ledgerWrites: number;
  freshness: ScheduledSyncFreshness;
  partial: boolean;
  sourceAsOf: string | null;
}

export interface SourceSyncExecutor {
  readonly source: string;
  readonly provider: string;
  execute(context: ScheduledSyncContext): Promise<ScheduledSyncResult>;
}

/**
 * Phase 5P-A — source executor registry.
 *
 * Resolution is `source + provider variant → executor`. Unknown pairs fail
 * closed: no run, no ledger write, no silent skip. CERT/PROD executors do
 * not exist in this phase (5P stays blocked).
 */
@Injectable()
export class SourceSyncExecutorRegistry {
  private readonly executors = new Map<string, SourceSyncExecutor>();

  register(executor: SourceSyncExecutor): void {
    this.executors.set(`${executor.source}/${executor.provider}`, executor);
  }

  resolve(source: string, provider: string): SourceSyncExecutor {
    const executor = this.executors.get(`${source}/${provider}`);
    if (!executor) {
      throw new ScheduledSyncFailedError(
        'INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE',
        `Fonte "${source}" não possui executor de sincronização agendada`,
      );
    }
    return executor;
  }
}

/**
 * Phase 5P-A — scheduled B3 SIMULATED executor.
 *
 * Collects, classifies and records a preview IntegrationRun
 * (AWAITING_REVIEW) with zero ledger writes. Human confirmation stays on
 * the normal review path. Uses the stable SNAPSHOT_1 fixture scenario:
 * deterministic, offline, credential-free.
 */
@Injectable()
export class SimulatedB3SyncExecutor implements SourceSyncExecutor {
  readonly source = 'B3';
  readonly provider = 'SIMULATED';
  /** Stable scheduled-sync fixture. Never a live endpoint, never credentials. */
  static readonly SCENARIO = 'SNAPSHOT_1';

  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accounts: IAccountRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(GetPortfolioStateUseCase)
    private readonly portfolioState: GetPortfolioStateUseCase,
    @Inject(IntegrationRunService)
    private readonly runs: IntegrationRunService,
  ) {}

  async execute(context: ScheduledSyncContext): Promise<ScheduledSyncResult> {
    const portfolio = await this.portfolios.findById(context.portfolioId);
    if (!portfolio) {
      throw new ScheduledSyncFailedError(
        'INTEGRATION.SCHEDULED_PORTFOLIO_NOT_FOUND',
        'Carteira não encontrada para a sincronização agendada',
      );
    }
    const [assets, accounts] = await Promise.all([
      this.assets.list(),
      this.accounts.findByPortfolioId(context.portfolioId),
    ]);
    if (accounts.length === 0) {
      throw new ScheduledSyncFailedError(
        'INTEGRATION.SCHEDULED_NO_ACCOUNT',
        'Sincronização agendada exige ao menos uma conta na carteira',
      );
    }
    const defaultAccountId = [...accounts]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((account) => account.id)[0]!;

    let runId: string | null = null;
    try {
      const existing = await this.loadExistingLedger(context.portfolioId);
      const state = await this.portfolioState.execute({
        userId: portfolio.userId,
        portfolioId: context.portfolioId,
      });
      const run = await this.runs.startRun({
        portfolioId: context.portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        trigger: 'SCHEDULED',
      });
      runId = run.id;
      const sync = runSimulatedB3Sync({
        syncState: 'AUTHORIZED',
        provider: new SimulatedB3Provider({ scenario: SimulatedB3SyncExecutor.SCENARIO }),
        portfolioId: context.portfolioId,
        assets: assets.map((asset) => ({
          id: asset.id,
          ticker: asset.ticker,
          exchange: asset.exchange,
          status: asset.status,
        })),
        accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
        defaultAccountId,
        existing,
        ledgerPositions: state.positions.map((position) => ({
          assetId: position.assetId,
          quantity: position.quantity,
        })),
        today: civilDateInTimezone(context.now, context.timezone),
        lastSuccessfulSyncAt: null,
      });
      await this.runs.recordPreview({
        runId,
        portfolioId: context.portfolioId,
        recordsFetched: sync.recordsFetched,
        recordsNormalized: sync.normalized,
        newCandidates: sync.newCandidates,
        exactDuplicates: sync.exactDuplicates,
        probableDuplicates: sync.probableDuplicates,
        conflicts: sync.conflicts,
        unsupported: sync.unsupported,
        invalid: sync.invalid,
        partial: sync.partial,
        sourceAsOf: sync.sourceAsOf,
      });
      return {
        runId,
        ledgerWrites: 0,
        freshness: 'FRESH',
        partial: sync.partial,
        sourceAsOf: sync.sourceAsOf,
      };
    } catch (error: unknown) {
      if (runId) {
        const blocked = error instanceof SimulatedB3SyncBlockedError;
        await this.runs.recordFailure({
          runId,
          portfolioId: context.portfolioId,
          errorCode: blocked
            ? 'INTEGRATION.SCHEDULED_SOURCE_BLOCKED'
            : 'INTEGRATION.SCHEDULED_SYNC_FAILED',
          errorMessage: blocked
            ? 'Fonte simulada bloqueada para sincronização agendada'
            : 'Falha na sincronização agendada. Tente novamente.',
        });
      }
      if (error instanceof ScheduledSyncFailedError) throw error;
      throw new ScheduledSyncFailedError(
        'INTEGRATION.SCHEDULED_SYNC_FAILED',
        'Falha na sincronização agendada. Tente novamente.',
      );
    }
  }

  /**
   * Same ledger projection as the interactive preview path (dedupe parity):
   * canonical JSON rows plus canonical fingerprints. Income rows keep the
   * credited amount; trades keep quantity/price/fees; conversions keep the
   * dual-asset reference with the exact ratio.
   */
  private async loadExistingLedger(portfolioId: string): Promise<ExistingLedgerRow[]> {
    const transactions = await this.transactions.findByPortfolioId(portfolioId);
    return transactions.map((transaction) => {
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
    });
  }
}
