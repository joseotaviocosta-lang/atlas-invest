/**
 * Pre-baseline snapshot gate + unsettled-trade exception (KCRE11-shaped).
 *
 * Generic safety net for ANY B3-sourced flow (movement, negotiation): a
 * BUY/SELL dated on/before an existing opening TRANSFER_IN for the same
 * asset+account is downgraded to NEEDS_REVIEW, because the snapshot may
 * already represent that custody. Confirming blindly would double-count.
 *
 * The gate is intentionally dumb: it cannot know whether the snapshot
 * includes the trade (settled) or not (settled after the cutoff). The
 * narrow, owner-reviewed exception `PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT`
 * covers the proven-unsettled case. The default never weakens.
 *
 * Pure, deterministic, zero I/O. Exact decimal/date strings only.
 */

import type { ClassifiedCandidate, ExistingLedgerRow, ImportRowStatus } from './types';

export const UNSETTLED_TRADE_RESOLUTIONS = ['PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT'] as const;
export type UnsettledTradeResolutionType = (typeof UNSETTLED_TRADE_RESOLUTIONS)[number];

export interface UnsettledTradeResolution {
  readonly type: UnsettledTradeResolutionType;
  /** Owner-stated evidence (1..500 chars). Recorded in ledger notes. */
  readonly reason: string;
  /**
   * Independently verified settlement date (civil YYYY-MM-DD), if known.
   * Metadata for provenance only — canonical replay ordering always uses
   * tradeDate. Never fabricated from D+2.
   */
  readonly declaredSettlementDate?: string;
}

export const PRE_BASELINE_GATE_CODE = 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT';

/** Issue codes that an owner resolution (not a force) can satisfy. */
const RESOLUTION_ISSUE_CODES = new Set(['UNKNOWN_ASSET', 'AMBIGUOUS_ASSET', 'ACCOUNT_REQUIRED']);

function isB3Provider(provider: string): boolean {
  return provider.toUpperCase().includes('B3');
}

export interface PreBaselineGateInput {
  readonly candidates: readonly ClassifiedCandidate[];
  readonly existing: readonly ExistingLedgerRow[];
}

function findCoveringSnapshot(
  candidate: ClassifiedCandidate,
  existing: readonly ExistingLedgerRow[],
): ExistingLedgerRow | undefined {
  return existing.find(
    (row) =>
      row.type === 'TRANSFER_IN' &&
      row.assetId === candidate.assetId &&
      (candidate.accountId === null || row.accountId === candidate.accountId) &&
      row.tradeDate >= candidate.tradeDate,
  );
}

/**
 * Downgrades pre-baseline BUY/SELL/BONUS/SUBSCRIPTION rows covered by an
 * opening snapshot. Downgrades only — never promotes to READY.
 * Eligible BUY/SELL rows are flagged for the owner-reviewed exception.
 */
export function applyPreBaselineSnapshotGate(input: PreBaselineGateInput): ClassifiedCandidate[] {
  const { candidates, existing } = input;
  return candidates.map((candidate) => {
    if (
      (candidate.operation === 'BUY' ||
        candidate.operation === 'SELL' ||
        candidate.operation === 'BONUS' ||
        candidate.operation === 'SUBSCRIPTION') &&
      candidate.status === 'READY'
    ) {
      const covering = findCoveringSnapshot(candidate, existing);
      if (covering) {
        const eligible =
          (candidate.operation === 'BUY' || candidate.operation === 'SELL') &&
          isB3Provider(candidate.provider) &&
          candidate.duplicate === 'NEW';
        return {
          ...candidate,
          status: 'NEEDS_REVIEW' as ImportRowStatus,
          unsettledExceptionEligible: eligible || undefined,
          coveringSnapshotDate: covering.tradeDate,
          issues: [
            ...candidate.issues,
            {
              code: PRE_BASELINE_GATE_CODE,
              message:
                'Lançamento em data anterior ou igual ao snapshot de abertura que já representa a custódia; confirmar duplicaria a posição. Se o trade liquidou após o baseline (custódia ainda não refletida no snapshot), a representação correta exige decisão explícita do titular — nunca importação silenciosa.',
            },
          ],
        };
      }
    }
    return candidate;
  });
}

export type UnsettledEligibility =
  | { readonly eligible: true; readonly baselineDate: string }
  | { readonly eligible: false; readonly code: string };

/**
 * Server-side verification for an owner-submitted unsettled-trade
 * resolution. Re-derives everything from the SERVER-computed candidate —
 * never trusts client status. The covering snapshot date travels on the
 * candidate itself (set by the gate from ledger state during preview), so no
 * extra ledger read is needed at confirm time.
 */
export function verifyUnsettledTradeResolution(
  candidate: ClassifiedCandidate,
): UnsettledEligibility {
  if (candidate.operation !== 'BUY' && candidate.operation !== 'SELL') {
    return { eligible: false, code: 'RESOLUTION_OPERATION_NOT_SUPPORTED' };
  }
  if (!isB3Provider(candidate.provider)) {
    return { eligible: false, code: 'RESOLUTION_SOURCE_NOT_SUPPORTED' };
  }
  if (candidate.status !== 'NEEDS_REVIEW') {
    return { eligible: false, code: 'RESOLUTION_STATUS_NOT_GATED' };
  }
  if (candidate.duplicate !== 'NEW') {
    return { eligible: false, code: 'RESOLUTION_DUPLICATE_STATE' };
  }
  if (!candidate.assetId || !candidate.accountId) {
    return { eligible: false, code: 'RESOLUTION_UNRESOLVED' };
  }
  const codes = candidate.issues.map((issue) => issue.code);
  if (!codes.includes(PRE_BASELINE_GATE_CODE)) {
    return { eligible: false, code: 'RESOLUTION_GATE_NOT_PRESENT' };
  }
  if (codes.some((code) => code !== PRE_BASELINE_GATE_CODE && !RESOLUTION_ISSUE_CODES.has(code))) {
    return { eligible: false, code: 'RESOLUTION_OTHER_BLOCKERS' };
  }
  if (!candidate.coveringSnapshotDate) {
    return { eligible: false, code: 'RESOLUTION_NO_COVERING_SNAPSHOT' };
  }
  return { eligible: true, baselineDate: candidate.coveringSnapshotDate };
}

/**
 * Validates owner-submitted resolution metadata (reason + optional declared
 * settlement date). Pure string/civil-date checks — no financial math.
 */
export function validateUnsettledResolutionMetadata(resolution: {
  readonly type?: string;
  readonly reason?: string;
  readonly declaredSettlementDate?: string;
}): { readonly valid: true } | { readonly valid: false; readonly code: string } {
  if (resolution.type !== 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT') {
    return { valid: false, code: 'RESOLUTION_UNKNOWN_TYPE' };
  }
  const reason = (resolution.reason ?? '').trim();
  if (reason.length === 0 || reason.length > 500) {
    return { valid: false, code: 'RESOLUTION_REASON_REQUIRED' };
  }
  if (
    resolution.declaredSettlementDate !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(resolution.declaredSettlementDate)
  ) {
    return { valid: false, code: 'RESOLUTION_INVALID_SETTLEMENT_DATE' };
  }
  return { valid: true };
}
