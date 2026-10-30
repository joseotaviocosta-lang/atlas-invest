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
  canonicalConversionFingerprint,
  canonicalFingerprint,
  canonicalIncomeFingerprint,
  normalizeDecimalValue,
  probableConversionMatchKey,
  probableIncomeMatchKey,
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
    amount?: string;
    targetAssetId?: string | null;
    targetQuantity?: string;
    conversionRatio?: string;
    conversionType?: string;
    currency: string;
  },
  row: ExistingLedgerRow,
): boolean {
  // Decimal comparison is canonical: the ledger persists NUMERIC(38,18),
  // which strips insignificant zeros (`38.50` -> `38.5`). Compare normalized.
  if (
    row.type !== candidate.operation ||
    row.tradeDate !== candidate.tradeDate ||
    row.currency !== candidate.currency
  ) {
    return false;
  }
  if (candidate.amount !== undefined) {
    // Income identity is value-only: shares-held figures are informational
    // and must not split the identity of one payout.
    return normalizeDecimalValue(row.amount) === normalizeDecimalValue(candidate.amount);
  }
  if (candidate.operation === 'RECEIPT_CONVERSION') {
    // Conversion identity is dual-asset: source + target + exact ratio + kind.
    return (
      (row.targetAssetId ?? null) === (candidate.targetAssetId ?? null) &&
      normalizeDecimalValue(row.targetQuantity) ===
        normalizeDecimalValue(candidate.targetQuantity ?? null) &&
      normalizeDecimalValue(row.conversionRatio) ===
        normalizeDecimalValue(candidate.conversionRatio ?? null) &&
      (row.conversionType ?? null) === (candidate.conversionType ?? null) &&
      normalizeDecimalValue(row.quantity) === normalizeDecimalValue(candidate.quantity)
    );
  }
  return (
    normalizeDecimalValue(row.quantity) === normalizeDecimalValue(candidate.quantity) &&
    normalizeDecimalValue(row.unitPrice) === normalizeDecimalValue(candidate.unitPrice) &&
    normalizeDecimalValue(row.fees) === normalizeDecimalValue(candidate.fees)
  );
}

export interface ClassifyInput {
  portfolioId: string;
  provider: string;
  candidate: NormalizedCandidate;
  assetMatch: AssetMatch;
  accountMatch: AccountMatch;
  defaultAccountId: string | null;
  existing: ExistingLedgerRow[];
  /**
   * Pre-resolved target asset for RECEIPT_CONVERSION rows (resolved WITHOUT
   * successor fallback — conversion is a corporate event, never a rename;
   * PART AD). Absent for every other operation.
   */
  targetAssetMatch?: AssetMatch;
}

export function classifyOne(input: ClassifyInput): ClassifiedCandidate {
  const {
    portfolioId,
    provider,
    candidate,
    assetMatch,
    accountMatch,
    defaultAccountId,
    existing,
    targetAssetMatch,
  } = input;

  const assetId = assetMatch.asset?.id ?? null;
  const accountId = accountMatch.account?.id ?? defaultAccountId;

  // Income identity is value-only (amount), conversions use the dual-asset
  // key, trades use the full economic key.
  const isIncome = candidate.amount !== undefined;
  const isConversion = candidate.operation === 'RECEIPT_CONVERSION';
  const targetAssetId = isConversion ? (targetAssetMatch?.asset?.id ?? null) : null;
  const targetAssetResolution: AssetMatch['resolution'] = isConversion
    ? (targetAssetMatch?.resolution ?? 'NOT_FOUND')
    : 'NOT_FOUND';

  let fingerprint: string | null = null;
  if (assetId && accountId) {
    fingerprint = isIncome
      ? canonicalIncomeFingerprint({
          portfolioId,
          accountId,
          assetId,
          type: candidate.operation,
          tradeDate: candidate.tradeDate,
          amount: candidate.amount ?? null,
          currency: candidate.currency,
        })
      : isConversion && targetAssetId
        ? canonicalConversionFingerprint({
            portfolioId,
            accountId,
            assetId,
            targetAssetId,
            type: candidate.operation,
            tradeDate: candidate.tradeDate,
            quantity: candidate.quantity,
            targetQuantity: candidate.targetQuantity ?? '',
            conversionRatio: candidate.conversionRatio ?? '',
            conversionType: candidate.conversionType ?? '',
            currency: candidate.currency,
          })
        : canonicalFingerprint({
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
      duplicate = sameCanonicalFields({ ...candidate, targetAssetId }, hit)
        ? 'EXACT_DUPLICATE'
        : 'CONFLICT';
    }
  }
  if (duplicate === 'NEW' && fingerprint) {
    const hit = existing.find((row) => row.fingerprint === fingerprint);
    if (hit) {
      duplicate = 'EXACT_DUPLICATE';
    }
  }
  if (duplicate === 'NEW' && assetId && accountId) {
    const key = isIncome
      ? probableIncomeMatchKey({
          portfolioId,
          accountId,
          assetId,
          type: candidate.operation,
          tradeDate: candidate.tradeDate,
          currency: candidate.currency,
        })
      : isConversion && targetAssetId
        ? probableConversionMatchKey({
            portfolioId,
            accountId,
            assetId,
            targetAssetId,
            type: candidate.operation,
            tradeDate: candidate.tradeDate,
            quantity: candidate.quantity,
            targetQuantity: candidate.targetQuantity ?? '',
            conversionType: candidate.conversionType ?? '',
            currency: candidate.currency,
          })
        : probableMatchKey({
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
      // Ledger income rows always carry the value-only fingerprint; trade
      // rows carry the full key. Recompute the candidate-side variant.
      if (row.amount !== null && row.amount !== undefined) {
        return (
          probableIncomeMatchKey({
            portfolioId,
            accountId: row.accountId,
            assetId: row.assetId,
            type: row.type,
            tradeDate: row.tradeDate,
            currency: row.currency,
          }) === key
        );
      }
      if (row.type === 'RECEIPT_CONVERSION' && row.targetAssetId) {
        return (
          probableConversionMatchKey({
            portfolioId,
            accountId: row.accountId,
            assetId: row.assetId,
            targetAssetId: row.targetAssetId,
            type: row.type,
            tradeDate: row.tradeDate,
            quantity: row.quantity,
            targetQuantity: row.targetQuantity ?? '',
            conversionType: row.conversionType ?? '',
            currency: row.currency,
          }) === key
        );
      }
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

  // PART U: conversions without an EXACT effective date never stay READY,
  // regardless of how complete the remaining fields are.
  const conversionIssues =
    isConversion && candidate.dateConfidence !== undefined && candidate.dateConfidence !== 'EXACT'
      ? [
          {
            code: 'CONVERSION_DATE_UNVERIFIED' as const,
            field: 'date',
            message:
              'Conversão de recibo identificada, mas a data exata não foi encontrada nas fontes disponíveis. O evento não será importado até que a data seja comprovada.',
          },
        ]
      : [];

  let status = candidate.status;
  if (status === 'READY') {
    if (duplicate === 'EXACT_DUPLICATE') {
      status = 'DUPLICATE';
    } else if (
      duplicate === 'PROBABLE_DUPLICATE' ||
      duplicate === 'CONFLICT' ||
      assetMatch.resolution !== 'RESOLVED' ||
      (isConversion && targetAssetResolution !== 'RESOLVED') ||
      accountId === null ||
      conversionIssues.length > 0
    ) {
      status = 'NEEDS_REVIEW';
    }
  } else if (status === 'NEEDS_REVIEW' && duplicate === 'EXACT_DUPLICATE') {
    status = 'DUPLICATE';
  }

  const baseIssues =
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

  const issues =
    isConversion && targetAssetResolution !== 'RESOLVED' && duplicate !== 'EXACT_DUPLICATE'
      ? [
          ...baseIssues,
          {
            code: 'UNKNOWN_TARGET_ASSET' as const,
            field: 'target_ticker',
            message: `Ativo destino "${candidate.targetTicker ?? ''}" não encontrado no cadastro`,
          },
        ]
      : baseIssues;

  return Object.freeze({
    ...candidate,
    status:
      assetMatch.resolution === 'AMBIGUOUS' && candidate.status === 'READY'
        ? 'AMBIGUOUS_ASSET'
        : status,
    issues: Object.freeze([...issues, ...conversionIssues]) as ClassifiedCandidate['issues'],
    assetId,
    assetResolution: assetMatch.resolution,
    targetAssetId,
    targetAssetResolution,
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
    | 'targetAssetId'
    | 'accountId'
    | 'operation'
    | 'tradeDate'
    | 'quantity'
    | 'targetQuantity'
    | 'conversionRatio'
    | 'conversionType'
    | 'unitPrice'
    | 'fees'
    | 'amount'
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
    targetAssetId: classified.targetAssetId ?? null,
    accountId: classified.accountId,
    type: classified.operation,
    tradeDate: classified.tradeDate,
    quantity: classified.quantity,
    targetQuantity: classified.targetQuantity ?? null,
    conversionRatio: classified.conversionRatio ?? null,
    conversionType: classified.conversionType ?? null,
    unitPrice: classified.unitPrice,
    fees: classified.fees,
    amount: classified.amount ?? null,
    currency: classified.currency,
    fingerprint: classified.fingerprint,
  };
}
