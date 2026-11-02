import type { CanonicalRealizedResult } from '@atlas/tax-engine';
import {
  Money,
  type Transaction,
} from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import {
  resolveTaxCost,
  toTaxResolutionEvidenceRows,
  toTaxResolutionLedgerLots,
  type TaxCostResolutionStatus,
} from '@atlas/tax-intelligence';
import type { CostBasisEvidenceRow } from '@atlas/database';

/**
 * Gated evidence-cost enrichment at the loadContext seam (CTE-2, ADR-312).
 *
 * - Flag OFF: canonical map returned untouched (no evidence read needed);
 *   trace records every disposal as not evaluated.
 * - Flag ON: INCOMPLETE canonical disposals are resolved as of their own
 *   tradeDate via resolveTaxCost; only COMPLETE_WITH_VERIFIED_EVIDENCE
 *   enriches the map. KNOWN entries are never touched. DAY_TRADE legs keep
 *   their same-day buy-leg computation (they never read this map for cost).
 * - Pure apart from inputs: no I/O, no clock, no tax formulas. Replay is
 *   reused read-only for as-of position quantities.
 */

export function isTaxCostEvidenceEnrichmentEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED === 'true';
}

/**
 * Previous civil day (UTC date arithmetic, no timezones). The replay asOf is
 * inclusive, so disposal-date resolution replays strictly before the sale:
 * the position must be the pre-sale holding, never post-sale.
 */
export function previousCivilDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Invalid civil date '${isoDate}'`);
  const prev = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - 86400000);
  const y = prev.getUTCFullYear();
  const m = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const d = String(prev.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type EvidenceCostTraceSource = 'CANONICAL_LEDGER' | 'VERIFIED_EVIDENCE' | 'UNKNOWN';

export interface EvidenceCostTraceSourceRef {
  readonly evidenceId: string;
  readonly evidenceVersion: number;
  readonly fingerprint: string;
  readonly evidenceType?: string;
  readonly acquisitionDate: string;
  readonly quantity: string;
  readonly totalCost: string;
  readonly verifiedAt?: string | null;
}

export interface EvidenceCostTrace {
  readonly transactionId: string;
  readonly assetId: string;
  readonly tradeDate: string;
  readonly source: EvidenceCostTraceSource;
  readonly resolutionStatus: TaxCostResolutionStatus | 'NOT_EVALUATED';
  readonly ledgerKnownQuantity?: string;
  readonly evidenceKnownQuantity?: string;
  readonly resolvedCost?: string;
  readonly evidenceSources: readonly EvidenceCostTraceSourceRef[];
}

/**
 * First-disposal review signal (CTE-4, Option A + documented limitation).
 *
 * Pure derivation: every VERIFIED_EVIDENCE trace entry yields one signal.
 * Without persistence there is no "first ever" memory across requests, so
 * the caller logs each signal per computation and the Owner audits the first
 * real occurrence when it appears. No amounts, no PII — identifiers and
 * dates only (AGENTS.md log sanitization).
 */
export interface EnrichedDisposalSignal {
  readonly signal: 'EVIDENCE_TAX_DISPOSAL_REVIEW_REQUIRED';
  readonly transactionId: string;
  readonly assetId: string;
  readonly tradeDate: string;
  readonly resolutionStatus: TaxCostResolutionStatus;
}

export function detectEnrichedDisposalSignals(
  trace: readonly EvidenceCostTrace[],
): EnrichedDisposalSignal[] {
  return trace
    .filter((entry) => entry.source === 'VERIFIED_EVIDENCE')
    .map((entry) => ({
      signal: 'EVIDENCE_TAX_DISPOSAL_REVIEW_REQUIRED' as const,
      transactionId: entry.transactionId,
      assetId: entry.assetId,
      tradeDate: entry.tradeDate,
      resolutionStatus: entry.resolutionStatus as TaxCostResolutionStatus,
    }));
}

export interface EnrichCanonicalRealizedInput {
  readonly canonicalMap: ReadonlyMap<string, CanonicalRealizedResult>;
  readonly transactions: readonly Transaction[];
  readonly evidenceRows: readonly CostBasisEvidenceRow[];
  readonly enabled: boolean;
}

export interface EnrichCanonicalRealizedOutput {
  readonly map: Map<string, CanonicalRealizedResult>;
  readonly trace: readonly EvidenceCostTrace[];
}

function traceSourceRefs(rows: readonly CostBasisEvidenceRow[]): EvidenceCostTraceSourceRef[] {
  return rows.map((row) => ({
    evidenceId: row.id,
    evidenceVersion: row.version,
    fingerprint: row.fingerprint,
    ...(row.evidenceType ? { evidenceType: row.evidenceType } : {}),
    acquisitionDate: row.acquisitionDate,
    quantity: row.quantityCovered,
    totalCost: row.totalCost ?? '',
    ...(row.confirmedAt ? { verifiedAt: row.confirmedAt.toISOString() } : {}),
  }));
}

export function enrichCanonicalRealizedWithEvidence(
  input: EnrichCanonicalRealizedInput,
): EnrichCanonicalRealizedOutput {
  const out = new Map<string, CanonicalRealizedResult>(input.canonicalMap);
  const trace: EvidenceCostTrace[] = [];
  const sellsById = new Map<string, Transaction>();
  for (const tx of input.transactions as unknown as Array<Transaction & { id?: unknown; type?: string }>) {
    if (tx.type === 'SELL') sellsById.set(String(tx.id), tx);
  }

  for (const [txId, entry] of input.canonicalMap) {
    const sell = sellsById.get(txId);
    if (!sell) continue;
    const sellAny = sell as unknown as {
      accountId?: unknown;
      assetId?: unknown;
      quantity?: { value?: unknown };
      tradeDate?: { toString?: () => string } | string;
      currency?: unknown;
    };
    const accountId = String(sellAny.accountId ?? '');
    const assetId = String(sellAny.assetId ?? '');
    const tradeDate = typeof sellAny.tradeDate === 'string' ? sellAny.tradeDate : sellAny.tradeDate?.toString?.() ?? '';
    const context = { transactionId: txId, assetId, tradeDate };
    if (entry.status === 'KNOWN') {
      trace.push({ ...context, source: 'CANONICAL_LEDGER', resolutionStatus: 'COMPLETE_LEDGER_ONLY', evidenceSources: [] });
      continue;
    }
    if (!input.enabled) {
      trace.push({ ...context, source: 'UNKNOWN', resolutionStatus: 'NOT_EVALUATED', evidenceSources: [] });
      continue;
    }
    const sellQty = String(sellAny.quantity?.value ?? '');
    const currency = String(sellAny.currency ?? '');
    const scopeRows = input.evidenceRows.filter(
      (row) => row.accountId === accountId && row.assetId === assetId,
    );

    let positionQty = '0';
    try {
      const portfolioId = String((sell as unknown as { portfolioId?: unknown }).portfolioId ?? '');
      const scoped = (input.transactions as unknown as Array<{ portfolioId?: unknown }>).filter(
        (tx) => String(tx.portfolioId) === portfolioId,
      );
      // Exclusive as-of: replay strictly before the sale date so the position
      // is the pre-sale holding (the engine asOf is inclusive and would
      // otherwise include the disposal itself). Same-day acquisitions stay in
      // the lot set and may over-cover → BLOCKED (fail-closed v1 limitation).
      const replayed = replayPortfolio({
        portfolioId,
        transactions: scoped as unknown as Transaction[],
        asOfDate: previousCivilDate(tradeDate),
      });
      const pos = replayed.state.accounts.get(accountId)?.assets.get(assetId);
      if (pos) positionQty = pos.quantity.value;
    } catch {
      trace.push({ ...context, source: 'UNKNOWN', resolutionStatus: 'UNKNOWN', evidenceSources: [] });
      continue;
    }

    const resolution = resolveTaxCost({
      portfolioId: String((sell as unknown as { portfolioId?: unknown }).portfolioId ?? ''),
      accountId,
      assetId,
      positionQuantity: positionQty,
      positionCurrency: currency,
      ledgerLots: toTaxResolutionLedgerLots(input.transactions, { accountId, assetId }),
      evidenceRows: toTaxResolutionEvidenceRows(scopeRows),
      asOfDate: tradeDate,
    });

    if (resolution.status !== 'COMPLETE_WITH_VERIFIED_EVIDENCE' || !resolution.resolvedAverageCost) {
      trace.push({
        ...context,
        source: 'UNKNOWN',
        resolutionStatus: resolution.status,
        evidenceSources: [],
      });
      continue;
    }
    if (!entry.netProceeds) {
      trace.push({
        ...context,
        source: 'UNKNOWN',
        resolutionStatus: resolution.status,
        evidenceSources: [],
      });
      continue;
    }
    const costBasisRemoved = Money.from(resolution.resolvedAverageCost, currency).multiply(sellQty).amount;
    const realizedGainLoss = Money.from(entry.netProceeds, currency)
      .subtract(Money.from(costBasisRemoved, currency)).amount;
    out.set(txId, {
      netProceeds: entry.netProceeds,
      costBasisRemoved,
      realizedGainLoss,
      status: 'KNOWN',
      currency,
    });
    trace.push({
      ...context,
      source: 'VERIFIED_EVIDENCE',
      resolutionStatus: resolution.status,
      ledgerKnownQuantity: resolution.ledgerKnownQuantity,
      evidenceKnownQuantity: resolution.evidenceKnownQuantity,
      resolvedCost: resolution.resolvedCost ?? undefined,
      evidenceSources: traceSourceRefs(
        scopeRows.filter((row) =>
          resolution.lots.some(
            (lot) => lot.sourceKind === 'VERIFIED_EVIDENCE' && (lot as { evidenceId?: string }).evidenceId === row.id,
          ),
        ),
      ),
    });
  }

  return { map: out, trace: Object.freeze(trace) };
}

