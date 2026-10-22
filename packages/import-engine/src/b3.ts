/**
 * Phase 5L — B3 investor-data adapter CONTRACT (no network, no secrets).
 *
 * This module is the source-side boundary for a future B3 B2B integration
 * (OAuth, mTLS, licensed credentials, investor consent — all out of scope).
 * It defines:
 * - the capability surface a future HTTP client must implement;
 * - the synthetic source-record shape that client will produce;
 * - deterministic mapping from B3 movement natures onto the canonical
 *   5K normalization pipeline (same validators, same decimal/date rules).
 *
 * Nothing here performs I/O, holds credentials, endpoints, certificates,
 * tokens, CPFs or real account identifiers.
 */

import { normalizeDecimalString, normalizeRow, type NormalizeOptions } from './normalize';
import type { MappedHeaders } from './template';
import type { NormalizedCandidate, RawImportRow } from './types';

export const B3_CAPABILITIES = [
  'POSITIONS',
  'MOVEMENTS',
  'TRADES',
  'PROVISIONED_EVENTS',
  'AUTHORIZATION_STATUS',
  'GUIDE',
  'LAST_AVAILABLE_DATA',
] as const;
export type B3Capability = (typeof B3_CAPABILITIES)[number];

/**
 * Nature labels of a B3 movement record. These are adapter-level labels for
 * the *kind* of economic event; the definitive B3 codification is pinned
 * during 5O certification against the B3 API Guia, never inferred here.
 */
export const B3_MOVEMENT_NATURES = [
  'COMPRA',
  'VENDA',
  'DIVIDENDO',
  'JCP',
  'RENDIMENTO_FII',
  'BONIFICACAO',
  'DESDOBRAMENTO',
  'GRUPAMENTO',
  'SUBSCRICAO',
  'AMORTIZACAO',
  'TRANSFERENCIA_SAIDA',
  'TRANSFERENCIA_ENTRADA',
] as const;
export type B3MovementNature = (typeof B3_MOVEMENT_NATURES)[number];

/**
 * Lifecycle of a provisioned/credited event as reported by the source.
 * Absent means "payable as stated" (the simulated-contract default, kept
 * explicit in the 5O-A dataset). Any other value fails closed to review —
 * the Atlas ledger has no provisioned-vs-paid distinction, so ambiguous
 * lifecycle must never post cash silently.
 */
export type B3EventLifecycle = 'PAID' | 'CREDITED' | 'LIQUIDADO' | 'PAGO' | 'PROVISIONED';

/**
 * Synthetic source record produced by the future B3 HTTP client after
 * parsing B3 payloads. All identifiers below are fictional in tests and
 * fixtures. A `pairKey` links mirrored custody-transfer legs.
 */
export interface B3MovementRecord {
  movementId: string;
  nature: string;
  ticker: string;
  tradeDate: string;
  settlementDate?: string;
  quantity: string;
  unitPrice?: string;
  amount?: string;
  fees?: string;
  currency?: string;
  custodianLabel?: string;
  accountLabel?: string;
  pairKey?: string;
  lifecycle?: string;
  notes?: string;
}

const B3_CANONICAL_COLUMNS = [
  'date',
  'ticker',
  'operation',
  'quantity',
  'unit_price',
  'fees',
  'currency',
  'broker',
  'account',
  'external_id',
  'settlement_date',
  'notes',
] as const;

function b3Mapping(): MappedHeaders['mapping'] {
  const mapping: MappedHeaders['mapping'] = {};
  B3_CANONICAL_COLUMNS.forEach((column, index) => {
    mapping[column] = index;
  });
  return mapping;
}

function b3Cells(movement: B3MovementRecord): string[] {
  return [
    movement.tradeDate,
    movement.ticker,
    movement.nature,
    movement.quantity,
    movement.unitPrice ?? '',
    movement.fees ?? '',
    movement.currency ?? 'BRL',
    movement.custodianLabel ?? '',
    movement.accountLabel ?? '',
    movement.movementId,
    movement.settlementDate ?? '',
    movement.notes ?? '',
  ];
}

/**
 * Normalizes one B3 movement through the canonical pipeline. TRANSFERENCIA
 * legs keep their `pairKey` as `transferGroupId` for mirrored-leg pairing
 * at confirm time; they never emit economic gain by themselves.
 *
 * Phase 5O-A — income integration: DIVIDENDO/JCP (and RENDIMENTO_FII) rows
 * carrying an exact `amount` normalize to importable income candidates
 * (operation = income kind, nunca BUY/SELL). Rows without an amount stay
 * deferred; unparseable amounts fail closed; rows explicitly marked with a
 * non-payable lifecycle stay in review — the ledger has no
 * provisioned-vs-paid distinction, so ambiguous lifecycle never posts cash.
 */
export function normalizeB3Movement(
  movement: B3MovementRecord,
  rowNumber: number,
  options: NormalizeOptions,
): NormalizedCandidate {
  const row: RawImportRow = {
    rowNumber,
    cells: Object.fromEntries(b3Cells(movement).map((value, index) => [String(index), value])),
  };
  const candidate = normalizeRow(row, b3Mapping(), options);
  const withPair =
    movement.pairKey && movement.pairKey.trim() !== '' ? { transferGroupId: movement.pairKey } : {};

  // Lifecycle gate: the ledger has no provisioned-vs-paid distinction, so an
  // income row explicitly marked with a non-payable situation stays in review.
  // Severity is respected: INVALID rows stay INVALID.
  const lifecycleReviewIssue =
    isIncomeKind(candidate.operation) &&
    movement.lifecycle !== undefined &&
    movement.lifecycle.trim() !== '' &&
    !['PAID', 'CREDITED', 'LIQUIDADO', 'PAGO'].includes(movement.lifecycle.trim().toUpperCase())
      ? {
          code: 'PROVISIONED_INCOME_NEEDS_REVIEW',
          field: 'operation',
          message: `Evento "${movement.nature.trim()}" com situação "${movement.lifecycle.trim()}" precisa de confirmação de crédito antes de ser importado`,
        }
      : null;
  const withLifecycleIssues = lifecycleReviewIssue
    ? [...candidate.issues, lifecycleReviewIssue]
    : candidate.issues;
  const lifecycleCappedStatus =
    lifecycleReviewIssue && (candidate.status === 'READY' || candidate.status === 'UNSUPPORTED')
      ? ('NEEDS_REVIEW' as const)
      : null;

  if (movement.amount === undefined || movement.amount.trim() === '') {
    return Object.freeze({
      ...candidate,
      ...withPair,
      ...(lifecycleCappedStatus ? { status: lifecycleCappedStatus } : {}),
      ...(lifecycleReviewIssue ? { issues: withLifecycleIssues } : {}),
    });
  }
  const amount = normalizeDecimalString(movement.amount);
  if (amount === null || !/^\d+(\.\d+)?$/.test(amount)) {
    return Object.freeze({
      ...candidate,
      ...withPair,
      status: 'INVALID' as const,
      issues: [
        ...candidate.issues,
        ...(lifecycleReviewIssue ? [lifecycleReviewIssue] : []),
        {
          code: 'INVALID_AMOUNT',
          field: 'amount',
          message: `Valor "${movement.amount.trim()}" inválido para a natureza "${movement.nature.trim()}"`,
        },
      ],
    });
  }
  if (!isIncomeKind(candidate.operation)) {
    // Non-income rows never carry `amount`: the candidate has no amount
    // semantics for trades, transfers or deferred events. (Malformed values
    // still failed closed above.)
    return Object.freeze({ ...candidate, ...withPair });
  }
  // Income with an exact amount: importable through the canonical writer —
  // but only by upgrading the expected deferred state, never by overriding
  // a failure. The operation is the income kind itself, never BUY/SELL.
  const upgradable = candidate.status === 'UNSUPPORTED';
  return Object.freeze({
    ...candidate,
    ...withPair,
    amount,
    ...(lifecycleCappedStatus
      ? { status: lifecycleCappedStatus, issues: withLifecycleIssues }
      : upgradable
        ? { status: 'READY' as const }
        : {}),
  });
}

function isIncomeKind(operation: string): boolean {
  return operation === 'DIVIDEND' || operation === 'JCP' || operation === 'FII_INCOME';
}
