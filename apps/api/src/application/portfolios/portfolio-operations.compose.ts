import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IntegrationRunRow,
  IPortfolioRepository,
} from '@atlas/database';
import { deriveReviewItems } from '@atlas/import-engine';
import {
  buildOperationsAttention,
  deriveOperationsStatus,
  previewAttention,
  type OperationsAttentionItem,
  type OperationsStatus,
} from '@atlas/portfolio-strategy';
import type { IntegrationSettingsService } from '../imports/integration-settings.service';
import type { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import type { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import {
  composePortfolioDataQuality,
  type PortfolioDataQualityModel,
} from './portfolio-data-quality.compose';

/**
 * Phase 5S-A — portfolio operations center composition (pure orchestration).
 *
 * Aggregates: integration settings (connection/schedule/last runs),
 * a bounded recent-run window (activity + review preview), and the 5R-E
 * data-quality composition (quality + reconciliation + pending reviews).
 * No new detection rules, no writes, no per-position loops, no replay
 * beyond what the reused composers already perform.
 */

export const OPERATIONS_RECENT_RUN_LIMIT = 10;
export const OPERATIONS_REVIEW_PREVIEW_LIMIT = 5;
export const OPERATIONS_ATTENTION_PREVIEW_LIMIT = 5;

export interface OperationsIntegrationView {
  source: string;
  provider: string;
  environment: string;
  availability: string;
  connectionState: string;
  schedule: { cadence: string; enabled: boolean } | null;
  lastRun: { status: string; at: string } | null;
  lastSuccessfulAt: string | null;
  status: string;
  structuralNote: boolean;
}

export interface OperationsRecentRunView {
  source: string;
  status: string;
  trigger: string | null;
  at: string;
  newRecords: number;
  confirmed: number;
}

export interface OperationsReviewPreviewView {
  source: string;
  status: string;
  severity: string;
  reasonCodes: string[];
  at: string;
}

export interface PortfolioOperationsModel {
  portfolioId: string;
  generatedAt: string;
  status: OperationsStatus;
  attention: { total: number; preview: OperationsAttentionItem[] };
  integrations: OperationsIntegrationView[];
  reconciliation: PortfolioDataQualityModel['reconciliation'];
  dataQuality: {
    status: PortfolioDataQualityModel['status'];
    summary: PortfolioDataQualityModel['summary'];
    issuesByDomain: PortfolioDataQualityModel['issuesByDomain'];
  };
  reviewPreview: OperationsReviewPreviewView[];
  recentActivity: OperationsRecentRunView[];
  availableActions: Array<{ type: string }>;
  limitations: string[];
}

function toDerivationInput(row: IntegrationRunRow) {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    source: row.source,
    trigger: row.trigger,
    status: row.status,
    newCandidates: row.newCandidates,
    exactDuplicates: row.exactDuplicates,
    probableDuplicates: row.probableDuplicates,
    conflicts: row.conflicts,
    unsupported: row.unsupported,
    invalid: row.invalid,
    partial: row.partial,
    reconciliation: row.reconciliation,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function composePortfolioOperations(
  deps: {
    portfolios: IPortfolioRepository;
    settings: IntegrationSettingsService;
    valuation: GetPortfolioValuationUseCase;
    allocation: GetPortfolioAllocationUseCase;
    assets: IAssetRepository;
    runs: IIntegrationRunRepository;
  },
  params: { portfolioId: string; userId: string },
): Promise<PortfolioOperationsModel> {
  const portfolio = params.userId
    ? await deps.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
    : await deps.portfolios.findById(params.portfolioId);
  if (!portfolio) {
    throw new EntityNotFoundError('Portfolio', params.portfolioId);
  }

  const [settings, quality, recentRuns] = await Promise.all([
    deps.settings.getSettings(params.userId, params.portfolioId),
    composePortfolioDataQuality(
      {
        portfolios: deps.portfolios,
        valuation: deps.valuation,
        allocation: deps.allocation,
        assets: deps.assets,
        runs: deps.runs,
      },
      params,
    ),
    deps.runs.listRecentByPortfolioIds([params.portfolioId], OPERATIONS_RECENT_RUN_LIMIT),
  ]);

  const integrations: OperationsIntegrationView[] = settings.sources.map((source) => ({
    source: source.source,
    provider: source.provider,
    environment: source.environment,
    availability: source.availability,
    connectionState: source.connection.state,
    schedule: source.schedule
      ? { cadence: source.schedule.cadence, enabled: source.schedule.enabled }
      : null,
    lastRun: source.lastRun
      ? { status: source.lastRun.status, at: source.lastRun.createdAt.toISOString() }
      : null,
    lastSuccessfulAt: source.lastSuccessfulRun
      ? source.lastSuccessfulRun.createdAt.toISOString()
      : null,
    status: source.status,
    // PREPARING/UNAVAILABLE availability and SIMULATED-only access are
    // product structure, never a user failure.
    structuralNote: source.availability !== 'AVAILABLE',
  }));

  const attention = buildOperationsAttention({
    latestRuns: settings.sources
      .filter((source) => source.lastRun !== null)
      .map((source) => ({
        source: source.source,
        status: source.lastRun!.status,
        at: source.lastRun!.createdAt.toISOString(),
      })),
    connections: settings.sources.map((source) => ({
      source: source.source,
      state: source.connection.state,
    })),
    pendingReviews: quality.reconciliation.pendingReviews,
    reconciliation: {
      divergent: quality.reconciliation.divergent,
      missingLocal: quality.reconciliation.missingLocal,
      missingSource: quality.reconciliation.missingSource,
      unresolved: quality.reconciliation.unresolved,
    },
    // Position-level quality issues only: portfolio-level reconciliation
    // facts are already covered by the reconciliation summary above.
    qualityIssues: quality.positions.flatMap((row) => row.issues),
  });
  const attentionPreview = previewAttention(attention, OPERATIONS_ATTENTION_PREVIEW_LIMIT);

  const reviewPreview: OperationsReviewPreviewView[] = deriveReviewItems(
    recentRuns.map(toDerivationInput),
  )
    .slice(0, OPERATIONS_REVIEW_PREVIEW_LIMIT)
    .map((item) => ({
      source: item.source,
      status: item.status,
      severity: item.severity,
      reasonCodes: [...item.reasonCodes],
      at: item.createdAt,
    }));

  const recentActivity: OperationsRecentRunView[] = recentRuns.map((row) => ({
    source: row.source,
    status: row.status,
    trigger: row.trigger,
    at: row.createdAt.toISOString(),
    newRecords: row.newCandidates,
    confirmed: row.confirmed,
  }));

  return {
    portfolioId: params.portfolioId,
    generatedAt: new Date().toISOString(),
    status: deriveOperationsStatus(attention),
    attention: attentionPreview,
    integrations,
    reconciliation: quality.reconciliation,
    dataQuality: {
      status: quality.status,
      summary: quality.summary,
      issuesByDomain: quality.issuesByDomain,
    },
    reviewPreview,
    recentActivity,
    availableActions: [
      { type: 'VIEW_REVIEWS' },
      { type: 'VIEW_DATA_QUALITY' },
      { type: 'VIEW_INTEGRATION_SETTINGS' },
      { type: 'VIEW_RUN_HISTORY' },
      { type: 'VIEW_IMPORT' },
    ],
    limitations: quality.limitations,
  };
}
