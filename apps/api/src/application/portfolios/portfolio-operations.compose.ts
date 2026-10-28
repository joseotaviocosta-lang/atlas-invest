import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IntegrationRunRow,
  IPortfolioRepository,
  IReconciliationDecisionRepository,
  ITransactionRectificationRepository,
  ITransactionRepository,
} from '@atlas/database';
import { deriveReviewItems } from '@atlas/import-engine';
import {
  buildOperationsAttention,
  deriveMaintenanceAction,
  deriveOperationsStatus,
  deriveOperationalRecovery,
  previewAttention,
  summarizeOperationalRecovery,
  type OperationsAttentionItem,
  type OperationsStatus,
  type OperationalRecoverySummary,
} from '@atlas/portfolio-strategy';
import type { IntegrationSettingsService } from '../imports/integration-settings.service';
import type { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import type { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import {
  composePortfolioDataQuality,
  type PortfolioDataQualityModel,
} from './portfolio-data-quality.compose';
import { composePortfolioAuditHistory } from './portfolio-audit-history.compose';
import type { OperationalAuditItem } from './portfolio-audit-history.types';

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
/** Bounded window for pair-workflow derivation (documented, not a lifetime total). */
export const OPERATIONS_REVIEW_WINDOW_LIMIT = 200;

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
  activityPreview?: OperationalAuditItem[];
  reviewWorkflow: {
    pendingPairs: number;
    decidedPairs: number;
    totalPairs: number;
  };
  /**
   * Phase 5S-D — maintenance counts over the same quality issues.
   * Same policy as the maintenance workspace; navigation only, no
   * new attention category.
   */
  maintenance: {
    actionable: number;
    navigable: number;
    unsupported: number;
    structural: number;
  };
  recovery: OperationalRecoverySummary;
  availableActions: Array<{ type: string }>;
  limitations: string[];
}

/**
 * Phase 5S-D — maintenance counts over the 5R-E issues in this
 * composition. Same pure policy as the maintenance workspace, so
 * counts are consistent everywhere. Structural classification limits
 * count as structural.
 */
function summarizeMaintenance(quality: PortfolioDataQualityModel): {
  actionable: number;
  navigable: number;
  unsupported: number;
  structural: number;
} {
  const counts = { actionable: 0, navigable: 0, unsupported: 0, structural: 0 };
  const issues = [...quality.positions.flatMap((row) => row.issues), ...quality.portfolioIssues];
  for (const issue of issues) {
    const status = deriveMaintenanceAction(issue.code).status;
    if (status === 'ACTIONABLE') counts.actionable += 1;
    else if (status === 'NAVIGABLE') counts.navigable += 1;
    else if (status === 'STRUCTURAL') counts.structural += 1;
    else counts.unsupported += 1;
  }
  counts.structural += quality.structuralLimitations.length;
  return counts;
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
    decisions: IReconciliationDecisionRepository;
    rectifications?: ITransactionRectificationRepository;
    transactions?: ITransactionRepository;
  },
  params: { portfolioId: string; userId: string },
): Promise<PortfolioOperationsModel> {
  const portfolio = params.userId
    ? await deps.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
    : await deps.portfolios.findById(params.portfolioId);
  if (!portfolio) {
    throw new EntityNotFoundError('Portfolio', params.portfolioId);
  }

  const [settings, quality, recentRuns, windowRuns, auditResult] = await Promise.all([
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
    deps.runs.listRecentByPortfolioIds([params.portfolioId], OPERATIONS_REVIEW_WINDOW_LIMIT),
    deps.rectifications
      ? composePortfolioAuditHistory(
          {
            rectifications: deps.rectifications,
            decisions: deps.decisions,
            runs: deps.runs,
            transactions: deps.transactions,
            assets: deps.assets,
          },
          {
            portfolioId: params.portfolioId,
            currentUserId: params.userId,
            limit: 5,
          },
        )
      : Promise.resolve({ items: [] as OperationalAuditItem[] }),
  ]);

  // Pair workflow over the bounded review window: which actionable runs
  // still have undecided pairs. Legacy aggregate runs without links are
  // excluded by construction (no pairs, never pending).
  const actionableRunIds = new Set(
    deriveReviewItems(windowRuns.map(toDerivationInput)).map((item) => item.runId),
  );
  const windowRunIds = windowRuns
    .filter((row) => actionableRunIds.has(row.id))
    .map((row) => row.id);
  const [linkCounts, windowDecisions] = await Promise.all([
    deps.runs.countLinksByRunIds(windowRunIds, params.portfolioId),
    deps.decisions.listByRunIds(windowRunIds, params.portfolioId),
  ]);
  const decidedByRun = new Map<string, number>();
  for (const decision of windowDecisions) {
    decidedByRun.set(
      decision.integrationRunId,
      (decidedByRun.get(decision.integrationRunId) ?? 0) + 1,
    );
  }
  let pendingPairs = 0;
  let decidedPairs = 0;
  let totalPairs = 0;
  for (const entry of linkCounts) {
    const total = entry.count;
    const decided = Math.min(decidedByRun.get(entry.runId) ?? 0, total);
    totalPairs += total;
    decidedPairs += decided;
    pendingPairs += total - decided;
  }

  const now = new Date();
  const recovery = summarizeOperationalRecovery(
    recentRuns.map((r) => ({
      id: r.id,
      portfolioId: r.portfolioId,
      source: r.source,
      status: r.status,
      trigger: r.trigger,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      partial: r.partial,
    })),
    now,
  );

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
      .map((source) => {
        const rec = deriveOperationalRecovery(
          {
            id: source.lastRun!.id ?? '',
            portfolioId: params.portfolioId,
            source: source.source,
            status: source.lastRun!.status,
            startedAt: source.lastRun!.startedAt ?? source.lastRun!.createdAt,
          },
          now,
        );
        return {
          source: source.source,
          status: source.lastRun!.status,
          at: source.lastRun!.createdAt.toISOString(),
          recoveryState: rec.recoveryState,
        };
      }),
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

  if (
    recovery.interruptedCount > 0 &&
    !attention.some((item) => item.code === 'SYNC_INTERRUPTED')
  ) {
    attention.push({
      code: 'SYNC_INTERRUPTED',
      domain: 'SYNC',
      severity: 'REVIEW',
      count: recovery.interruptedCount,
      facts: { source: null, assetId: null, at: null },
      actions: [{ type: 'VIEW_RUN_HISTORY' }],
    });
  }

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
    generatedAt: now.toISOString(),
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
    activityPreview: auditResult.items,
    reviewWorkflow: { pendingPairs, decidedPairs, totalPairs },
    maintenance: summarizeMaintenance(quality),
    recovery,
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
