/**
 * Phase 5K — duplicate classification (pure).
 *
 * Layers:
 * 1. source identity (`provider|externalId`) — exact or conflict;
 * 2. canonical fingerprint — exact duplicate across any source;
 * 3. price-insensitive key — probable duplicate for human review;
 * 4. otherwise NEW.
 *
 * Classification never writes, never deletes, never merges silently.
 */

import {
  canonicalFingerprint,
  normalizeDecimalValue,
  probableMatchKey,
  sourceIdentityKey,
} from './fingerprint';
import type {
  ClassifiedCandidate,
  DuplicateClassification,
  ExistingLedgerRow,
  ImportSummary,
  NormalizedCandidate,
} from './types';
import type { AccountMatch, AssetMatch } from './resolve';

export interface ClassifyInput {
  portfolioId: string;
  provider: string;
  candidate: NormalizedCandidate;
  assetMatch: AssetMatch;
  accountMatch: AccountMatch;
  defaultAccountId: string | null;
  existing: ExistingLedgerRow[];
}

function sameCanonicalFields(
  candidate: {
    operation: string;
    tradeDate: string;
    quantity: string;
    unitPrice: string;
    fees: string;
    currency: string;
  },
  row: ExistingLedgerRow,
): boolean {
  // Decimal comparison is canonical: the ledger persists NUMERIC(38,18),
  // which strips insignificant zeros (`38.50` -> `38.5`). Compare normalized.
  return (
    row.type === candidate.operation &&
    row.tradeDate === candidate.tradeDate &&
    normalizeDecimalValue(row.quantity) === normalizeDecimalValue(candidate.quantity) &&
    normalizeDecimalValue(row.unitPrice) === normalizeDecimalValue(candidate.unitPrice) &&
    normalizeDecimalValue(row.fees) === normalizeDecimalValue(candidate.fees) &&
    row.currency === candidate.currency
  );
}

export function classifyOne(input: ClassifyInput): ClassifiedCandidate {
  const { portfolioId, provider, candidate, assetMatch, accountMatch, defaultAccountId, existing } =
    input;

  const assetId = assetMatch.asset?.id ?? null;
  const accountId = accountMatch.account?.id ?? defaultAccountId;

  let fingerprint: string | null = null;
  if (assetId && accountId) {
    fingerprint = canonicalFingerprint({
      portfolioId,
      accountId,
      assetId,
      type: candidate.operation,
      tradeDate: candidate.tradeDate,
      quantity: candidate.quantity,
      unitPrice: candidate.unitPrice,
      fees: candidate.fees,
      currency: candidate.currency,
    });
  }

  let duplicate: DuplicateClassification = 'NEW';
  if (candidate.externalId) {
    const key = sourceIdentityKey(provider, candidate.externalId);
    const hit = existing.find(
      (row) =>
        row.provider !== null &&
        row.externalId !== null &&
        sourceIdentityKey(row.provider, row.externalId) === key,
    );
    if (hit) {
      duplicate = sameCanonicalFields(candidate, hit) ? 'EXACT_DUPLICATE' : 'CONFLICT';
    }
  }
  if (duplicate === 'NEW' && fingerprint) {
    const hit = existing.find((row) => row.fingerprint === fingerprint);
    if (hit) {
      duplicate = 'EXACT_DUPLICATE';
    }
  }
  if (duplicate === 'NEW' && assetId && accountId) {
    const key = probableMatchKey({
      portfolioId,
      accountId,
      assetId,
      type: candidate.operation,
      tradeDate: candidate.tradeDate,
      quantity: candidate.quantity,
      currency: candidate.currency,
    });
    const hit = existing.find((row) => {
      if (row.assetId !== assetId || row.accountId !== accountId) return false;
      return (
        probableMatchKey({
          portfolioId,
          accountId: row.accountId,
          assetId: row.assetId,
          type: row.type,
          tradeDate: row.tradeDate,
          quantity: row.quantity,
          currency: row.currency,
        }) === key
      );
    });
    if (hit) {
      duplicate = 'PROBABLE_DUPLICATE';
    }
  }

  let status = candidate.status;
  if (status === 'READY') {
    if (duplicate === 'EXACT_DUPLICATE') {
      status = 'DUPLICATE';
    } else if (
      duplicate === 'PROBABLE_DUPLICATE' ||
      duplicate === 'CONFLICT' ||
      assetMatch.resolution !== 'RESOLVED' ||
      accountId === null
    ) {
      status = 'NEEDS_REVIEW';
    }
  } else if (status === 'NEEDS_REVIEW' && duplicate === 'EXACT_DUPLICATE') {
    status = 'DUPLICATE';
  }

  const issues =
    duplicate === 'EXACT_DUPLICATE'
      ? [
          ...candidate.issues,
          {
            code: 'EXACT_DUPLICATE' as const,
            message: 'Operação já existe no livro-razão e será ignorada',
          },
        ]
      : duplicate === 'PROBABLE_DUPLICATE'
        ? [
            ...candidate.issues,
            {
              code: 'PROBABLE_DUPLICATE' as const,
              message: 'Operação semelhante já existe e precisa de revisão',
            },
          ]
        : duplicate === 'CONFLICT'
          ? [
              ...candidate.issues,
              {
                code: 'DUPLICATE_CONFLICT' as const,
                message:
                  'Mesmo identificador externo com valores diferentes: exige decisão explícita',
              },
            ]
          : assetMatch.resolution === 'AMBIGUOUS'
            ? [
                ...candidate.issues,
                {
                  code: 'AMBIGUOUS_ASSET' as const,
                  field: 'ticker',
                  message: `Ativo "${candidate.ticker}" existe em mais de uma exchange: selecione o ativo`,
                },
              ]
            : assetMatch.resolution === 'NOT_FOUND'
              ? [
                  ...candidate.issues,
                  {
                    code: 'UNKNOWN_ASSET' as const,
                    field: 'ticker',
                    message: `Ativo "${candidate.ticker}" não encontrado no cadastro`,
                  },
                ]
              : accountId === null
                ? [
                    ...candidate.issues,
                    {
                      code: 'ACCOUNT_REQUIRED' as const,
                      field: 'account',
                      message: 'Conta de custódia não identificada: selecione a conta',
                    },
                  ]
                : candidate.issues;

  return Object.freeze({
    ...candidate,
    status:
      assetMatch.resolution === 'AMBIGUOUS' && candidate.status === 'READY'
        ? 'AMBIGUOUS_ASSET'
        : status,
    issues: Object.freeze([...issues]) as ClassifiedCandidate['issues'],
    assetId,
    assetResolution: assetMatch.resolution,
    accountId,
    accountResolution: accountId !== null ? accountMatch.resolution : 'UNSPECIFIED',
    fingerprint,
    duplicate,
    provider,
  });
}

export function summarize(candidates: readonly ClassifiedCandidate[]): ImportSummary {
  const summary: ImportSummary = {
    totalRows: candidates.length,
    ready: 0,
    duplicates: 0,
    needsReview: 0,
    invalid: 0,
    unsupported: 0,
    ambiguousAssets: 0,
  };
  for (const candidate of candidates) {
    switch (candidate.status) {
      case 'READY':
        summary.ready += 1;
        break;
      case 'DUPLICATE':
        summary.duplicates += 1;
        break;
      case 'NEEDS_REVIEW':
        summary.needsReview += 1;
        break;
      case 'INVALID':
        summary.invalid += 1;
        break;
      case 'UNSUPPORTED':
        summary.unsupported += 1;
        break;
      case 'AMBIGUOUS_ASSET':
        summary.ambiguousAssets += 1;
        break;
    }
  }
  return Object.freeze(summary);
}

export function toLedgerSnapshotRow(
  provider: string,
  classified: Pick<
    ClassifiedCandidate,
    | 'assetId'
    | 'accountId'
    | 'operation'
    | 'tradeDate'
    | 'quantity'
    | 'unitPrice'
    | 'fees'
    | 'currency'
    | 'externalId'
    | 'fingerprint'
  >,
): ExistingLedgerRow | null {
  if (!classified.assetId || !classified.accountId || !classified.fingerprint) return null;
  return {
    provider,
    externalId: classified.externalId ?? null,
    assetId: classified.assetId,
    accountId: classified.accountId,
    type: classified.operation,
    tradeDate: classified.tradeDate,
    quantity: classified.quantity,
    unitPrice: classified.unitPrice,
    fees: classified.fees,
    currency: classified.currency,
    fingerprint: classified.fingerprint,
  };
}
