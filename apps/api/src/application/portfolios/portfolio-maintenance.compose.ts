import {
  deriveMaintenanceAction,
  type DataQualityIssue,
  type MaintenanceActionType,
  type MaintenanceStatus,
} from '@atlas/portfolio-strategy';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IPortfolioRepository,
} from '@atlas/database';
import type { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import type { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import {
  composePortfolioDataQuality,
  type DataQualityPositionRow,
} from './portfolio-data-quality.compose';

export interface MaintenanceItem {
  assetId: string | null;
  ticker: string | null;
  issueCode: string;
  domain: string;
  severity: string;
  maintenanceStatus: MaintenanceStatus;
  actionType: MaintenanceActionType;
  route: string | null;
  explanation: string;
  safetyNote: string | null;
  affectedCapabilities: string[];
  count: number | null;
}

export interface PortfolioMaintenanceModel {
  portfolioId: string;
  generatedAt: string;
  summary: {
    actionable: number;
    navigable: number;
    unsupported: number;
    structural: number;
    total: number;
  };
  actionableItems: MaintenanceItem[];
  navigableItems: MaintenanceItem[];
  unsupportedItems: MaintenanceItem[];
  structuralItems: MaintenanceItem[];
}

function toItem(issue: DataQualityIssue): MaintenanceItem {
  const action = deriveMaintenanceAction(issue.code);
  return {
    assetId: issue.facts.assetId,
    ticker: issue.facts.ticker,
    issueCode: issue.code,
    domain: issue.domain,
    severity: issue.severity,
    maintenanceStatus: action.status,
    actionType: action.actionType,
    route: action.route,
    explanation: action.explanation,
    safetyNote: action.safetyNote,
    affectedCapabilities: [...issue.affectedCapabilities],
    count: issue.facts.count,
  };
}

/**
 * Phase 5S-D — portfolio data maintenance workspace (read-only).
 *
 * Reuses the 5R-E quality composition verbatim (same replay budget,
 * no recompute) and maps every diagnosed issue plus the structural
 * classification limitations through the pure maintenance policy.
 * GET never writes. No new detection rules, no scores, no fix-all.
 */
export async function composePortfolioMaintenance(
  deps: {
    portfolios: IPortfolioRepository;
    valuation: GetPortfolioValuationUseCase;
    allocation: GetPortfolioAllocationUseCase;
    assets: IAssetRepository;
    runs: IIntegrationRunRepository;
  },
  params: { portfolioId: string; userId: string },
): Promise<PortfolioMaintenanceModel> {
  const quality = await composePortfolioDataQuality(deps, params);

  const issues: DataQualityIssue[] = [
    ...quality.positions.flatMap((row: DataQualityPositionRow) => row.issues),
    ...quality.portfolioIssues,
  ];
  const items = issues.map(toItem);

  // Structural limitations are portfolio-level facts from the same
  // composer (never per-position, never inferred).
  for (const code of quality.structuralLimitations) {
    const action = deriveMaintenanceAction(code);
    items.push({
      assetId: null,
      ticker: null,
      issueCode: code,
      domain: 'CLASSIFICATION',
      severity: 'INFO',
      maintenanceStatus: action.status,
      actionType: action.actionType,
      route: action.route,
      explanation: action.explanation,
      safetyNote: action.safetyNote,
      affectedCapabilities: [],
      count: null,
    });
  }

  const actionableItems = items.filter((item) => item.maintenanceStatus === 'ACTIONABLE');
  const navigableItems = items.filter((item) => item.maintenanceStatus === 'NAVIGABLE');
  const unsupportedItems = items.filter((item) => item.maintenanceStatus === 'UNSUPPORTED');
  const structuralItems = items.filter((item) => item.maintenanceStatus === 'STRUCTURAL');

  return {
    portfolioId: params.portfolioId,
    generatedAt: new Date().toISOString(),
    summary: {
      actionable: actionableItems.length,
      navigable: navigableItems.length,
      unsupported: unsupportedItems.length,
      structural: structuralItems.length,
      total: items.length,
    },
    actionableItems,
    navigableItems,
    unsupportedItems,
    structuralItems,
  };
}
