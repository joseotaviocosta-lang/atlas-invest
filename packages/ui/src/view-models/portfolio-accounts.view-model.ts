import { formatCurrency, formatQuantity } from '../formatters';
import { AssetMeta } from './asset-position-detail.view-model';
import { PortfolioStateDto } from './portfolio-overview.view-model';

/**
 * Institution directory entry (display metadata ONLY).
 *
 * Canonical identity of a custody account is ALWAYS its `accountId`.
 * The institution is never identity and never drives logic — name only.
 */
export interface InstitutionMeta {
  readonly id: string;
  readonly name: string;
}

/**
 * Account directory entry. Accepts the full `AccountJSON` shape
 * (`GET /api/v1/portfolios/:id/accounts`) as well as the minimal
 * `AccountMeta` (`{ id, name }`); every field beyond id/name is optional
 * and degrades gracefully to `null` when absent.
 */
export interface AccountDirectoryEntry {
  readonly id: string;
  readonly name: string;
  readonly institutionId?: string | null;
  readonly currency?: string | null;
  readonly status?: string | null;
}

export type AccountsMetaInput =
  readonly AccountDirectoryEntry[] | Record<string, AccountDirectoryEntry> | null | undefined;

export type InstitutionsMetaInput =
  readonly InstitutionMeta[] | Record<string, InstitutionMeta> | null | undefined;

export type AssetsMetaInput = readonly AssetMeta[] | Record<string, AssetMeta> | null | undefined;

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  CLOSED: 'Encerrada',
};

function isOpenPosition(quantity: string | null | undefined): boolean {
  return !!quantity && quantity !== '0';
}

function buildInstitutionMap(institutionsMeta: InstitutionsMetaInput): Map<string, string> {
  const map = new Map<string, string>();
  if (!institutionsMeta) return map;
  if (Array.isArray(institutionsMeta)) {
    for (const inst of institutionsMeta) {
      map.set(inst.id, inst.name);
    }
  } else {
    for (const [id, inst] of Object.entries(institutionsMeta)) {
      map.set(id, inst.name);
    }
  }
  return map;
}

function toDirectoryList(accountsMeta: AccountsMetaInput): AccountDirectoryEntry[] {
  if (!accountsMeta) return [];
  if (Array.isArray(accountsMeta)) return [...accountsMeta];
  return Object.values(accountsMeta);
}

function toAssetMap(assetsMeta: AssetsMetaInput): Map<string, AssetMeta> {
  const map = new Map<string, AssetMeta>();
  if (!assetsMeta) return map;
  if (Array.isArray(assetsMeta)) {
    for (const a of assetsMeta) {
      map.set(a.id, a);
    }
  } else {
    for (const [id, a] of Object.entries(assetsMeta)) {
      map.set(id, a);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Accounts overview (derived projection — no ledger, no financial math)
// ---------------------------------------------------------------------------

export interface AccountCardViewModel {
  readonly accountId: string;
  readonly accountName: string;
  readonly institutionId: string | null;
  /** Display metadata only. `null` when the institution is unknown. */
  readonly institutionName: string | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly statusLabel: string | null;
  /** Structural count of open positions (quantity > 0). Never a money sum. */
  readonly openPositionsCount: number;
  readonly hasIncompleteCost: boolean;
  readonly isEmpty: boolean;
}

export interface PortfolioAccountsViewModel {
  readonly portfolioId: string;
  readonly portfolioName: string;
  readonly accounts: readonly AccountCardViewModel[];
  readonly accountsCount: number;
  readonly isEmpty: boolean;
}

export interface BuildPortfolioAccountsOptions {
  readonly portfolioId: string;
  readonly portfolioName?: string;
  readonly state: PortfolioStateDto | null;
  readonly accountsMeta?: AccountsMetaInput;
  readonly institutionsMeta?: InstitutionsMetaInput;
}

/**
 * Pure, deterministic presentation mapper for the accounts overview.
 *
 * ARCHITECTURAL INVARIANTS (Fase 2E):
 * 1. Account identity is ALWAYS `accountId`. Institution is metadata only.
 * 2. Derived projection: reads the frozen `/state` read model + directory
 *    metadata. Introduces NO independent account ledger.
 * 3. Zero Client Financial Math: only formats server-provided strings and
 *    counts open positions structurally. No sums, divisions, averages or
 *    allocation percentages. No FX, no cross-currency totals.
 * 4. Incomplete cost basis renders as badges/flags, never as zero.
 */
export function buildPortfolioAccountsViewModel(
  options: BuildPortfolioAccountsOptions,
): PortfolioAccountsViewModel {
  const {
    portfolioId,
    portfolioName = 'Minha Carteira',
    state,
    accountsMeta,
    institutionsMeta,
  } = options;

  const institutionMap = buildInstitutionMap(institutionsMeta);
  const directory = toDirectoryList(accountsMeta);

  const stateAccounts = new Map((state?.accounts ?? []).map((acc) => [acc.accountId, acc]));

  const accounts: AccountCardViewModel[] = directory.map((entry) => {
    const stateAccount = stateAccounts.get(entry.id) ?? null;
    const openPositions = (stateAccount?.positions ?? []).filter((p) => isOpenPosition(p.quantity));
    const hasIncompleteCost = openPositions.some((p) => p.costBasisStatus === 'INCOMPLETE');
    const institutionId = entry.institutionId ?? null;

    return {
      accountId: entry.id,
      accountName: entry.name,
      institutionId,
      institutionName: institutionId ? (institutionMap.get(institutionId) ?? null) : null,
      currency: entry.currency ?? null,
      status: entry.status ?? null,
      statusLabel: entry.status ? (ACCOUNT_STATUS_LABELS[entry.status] ?? entry.status) : null,
      openPositionsCount: openPositions.length,
      hasIncompleteCost,
      isEmpty: openPositions.length === 0,
    };
  });

  accounts.sort((a, b) => a.accountName.localeCompare(b.accountName));

  return {
    portfolioId,
    portfolioName,
    accounts,
    accountsCount: accounts.length,
    isEmpty: accounts.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Account detail (derived projection — no ledger, no financial math)
// ---------------------------------------------------------------------------

export interface AccountPositionItem {
  readonly assetId: string;
  readonly assetTicker: string | null;
  readonly assetName: string | null;
  readonly quantity: string;
  readonly rawQuantity: string;
  readonly averageCost: string;
  readonly totalCost: string;
  readonly currency: string | null;
  readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  readonly isCostBasisIncomplete: boolean;
  readonly canNavigateToAsset: boolean;
}

export interface AccountDetailViewModel {
  readonly found: boolean;
  readonly portfolioId: string;
  readonly accountId: string;
  readonly accountName: string | null;
  readonly institutionId: string | null;
  /** Display metadata only. `null` when the institution is unknown. */
  readonly institutionName: string | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly statusLabel: string | null;
  readonly positions: readonly AccountPositionItem[];
  readonly openPositionsCount: number;
  readonly hasIncompleteCost: boolean;
  readonly isEmpty: boolean;
}

export interface BuildAccountDetailOptions {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly state: PortfolioStateDto | null;
  readonly accountsMeta?: AccountsMetaInput;
  readonly institutionsMeta?: InstitutionsMetaInput;
  readonly assetsMeta?: AssetsMetaInput;
}

/**
 * Pure, deterministic presentation mapper for the account detail view.
 *
 * Same invariants as the overview, plus:
 * - `found: false` when the account is absent from the portfolio directory
 *   (wrong-portfolio/deep-link safety: render not-found, never leak data).
 * - Per-position money values are formatted server strings, or '—' when
 *   `costBasisStatus` is INCOMPLETE. Never zero, never recomputed.
 * - Asset navigation only when the asset holds an open position in the
 *   portfolio state (closed-position safety, ADR-078).
 */
export function buildAccountDetailViewModel(
  options: BuildAccountDetailOptions,
): AccountDetailViewModel {
  const { portfolioId, accountId, state, accountsMeta, institutionsMeta, assetsMeta } = options;

  const institutionMap = buildInstitutionMap(institutionsMeta);
  const assetMap = toAssetMap(assetsMeta);
  const directory = toDirectoryList(accountsMeta);
  const entry = directory.find((e) => e.id === accountId) ?? null;

  if (!entry) {
    return {
      found: false,
      portfolioId,
      accountId,
      accountName: null,
      institutionId: null,
      institutionName: null,
      currency: null,
      status: null,
      statusLabel: null,
      positions: [],
      openPositionsCount: 0,
      hasIncompleteCost: false,
      isEmpty: true,
    };
  }

  const institutionId = entry.institutionId ?? null;
  const stateAccount = state?.accounts.find((acc) => acc.accountId === accountId) ?? null;

  // Open-position safety set (consolidated portfolio state, ADR-078).
  const openAssetIds = new Set<string>();
  if (state && Array.isArray(state.positions)) {
    for (const p of state.positions) {
      if (isOpenPosition(p.quantity)) {
        openAssetIds.add(p.assetId);
      }
    }
  }

  const positions: AccountPositionItem[] = (stateAccount?.positions ?? [])
    .filter((p) => isOpenPosition(p.quantity))
    .map((p) => {
      const asset = p.assetId ? (assetMap.get(p.assetId) ?? null) : null;
      const assetTicker = asset?.ticker ?? (p.assetId ? p.assetId.slice(0, 8) : null);
      const assetName = asset?.name ?? assetTicker;
      const isKnown = p.costBasisStatus === 'KNOWN';
      const currency = p.currency ?? null;

      return {
        assetId: p.assetId,
        assetTicker,
        assetName,
        quantity: formatQuantity(p.quantity),
        rawQuantity: p.quantity,
        averageCost:
          isKnown && p.averageCost && currency
            ? formatCurrency(p.averageCost.amount, currency)
            : '—',
        totalCost:
          isKnown && p.totalCost && currency ? formatCurrency(p.totalCost.amount, currency) : '—',
        currency,
        costBasisStatus: p.costBasisStatus,
        isCostBasisIncomplete: !isKnown,
        canNavigateToAsset: p.assetId ? openAssetIds.has(p.assetId) : false,
      };
    });

  positions.sort((a, b) => (a.assetTicker ?? a.assetId).localeCompare(b.assetTicker ?? b.assetId));

  const hasIncompleteCost = positions.some((p) => p.isCostBasisIncomplete);

  return {
    found: true,
    portfolioId,
    accountId,
    accountName: entry.name,
    institutionId,
    institutionName: institutionId ? (institutionMap.get(institutionId) ?? null) : null,
    currency: entry.currency ?? null,
    status: entry.status ?? null,
    statusLabel: entry.status ? (ACCOUNT_STATUS_LABELS[entry.status] ?? entry.status) : null,
    positions,
    openPositionsCount: positions.length,
    hasIncompleteCost,
    isEmpty: positions.length === 0,
  };
}
