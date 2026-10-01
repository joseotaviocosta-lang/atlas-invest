import type { TaxObligationRow, TaxPaymentEvidenceRow } from '@atlas/database';
import {
  deriveObligationDisplayStatus,
  type TaxObligationBaseStatus,
  type TaxObligationStatus,
} from '@atlas/tax-engine';

/**
 * Phase 4C.2 — serializable read models for tax obligations, DARF readiness and
 * manual payment evidence. All money is exact decimal strings; all dates are
 * civil `YYYY-MM-DD`; `null` means unavailable (never `"0"`). No tax arithmetic
 * happens here (ADR-264, ADR-265).
 */
export interface ObligationMoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface DeadlineSourceReadModel {
  readonly entryId: string;
  readonly dueDate: string;
  readonly version: number;
  readonly sourceAuthority: string;
  readonly sourceDocument: string;
  readonly sourceReference: string;
  readonly sourcePublishedAt: string;
  readonly verifiedAt: string;
}

export interface DarfPreparationReadModel {
  readonly revenueCode: string;
  readonly competence: string;
  readonly taxBucket: string;
  readonly principalAmount: ObligationMoneyReadModel;
  readonly dueDate: string;
  readonly sourceProvenance: DeadlineSourceReadModel;
}

export interface ObligationPaymentReadModel {
  readonly id: string;
  readonly paidAt: string;
  readonly amount: ObligationMoneyReadModel;
  readonly sourceType: string;
  readonly sourceReference: string | null;
  readonly status: string;
  readonly confirmedAt: string;
}

/**
 * Phase 4G.2C — composed 6015 breakdown. Category-level detail is preserved
 * even though the payment obligation is a single revenue-code amount. Exact
 * decimal strings; `null` component amounts mean not authoritative (never "0").
 */
export interface ObligationCompositionComponentReadModel {
  readonly category: string;
  readonly label: string;
  readonly status: string;
  readonly netCategoryTax: ObligationMoneyReadModel | null;
  readonly sourceRuleId: string | null;
  readonly sourceRuleVersion: string | null;
  readonly sourceFingerprint: string;
  readonly traceReference: string | null;
}

export interface ObligationCompositionReadModel {
  readonly revenueCode: string;
  readonly status: string;
  readonly reasonCode: string | null;
  readonly currency: string;
  readonly total: ObligationMoneyReadModel | null;
  readonly components: readonly ObligationCompositionComponentReadModel[];
  readonly fingerprint: string;
}

const COMPONENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  FII: 'FII',
  EQUITY_NORMAL: 'Operações comuns',
  EQUITY_DAY_TRADE: 'Day trade',
});

function readComposition(
  provenance: Record<string, unknown>,
): ObligationCompositionReadModel | null {
  const raw = provenance.composition;
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.revenueCode !== 'string' || typeof c.status !== 'string') return null;
  const currency = typeof c.currency === 'string' ? c.currency : 'BRL';
  const componentsRaw = Array.isArray(c.components) ? c.components : [];
  const components = componentsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      category: String(item.category ?? ''),
      label: COMPONENT_LABELS[String(item.category ?? '')] ?? String(item.category ?? ''),
      status: String(item.status ?? ''),
      netCategoryTax:
        typeof item.netCategoryTax === 'string' ? { amount: item.netCategoryTax, currency } : null,
      sourceRuleId: typeof item.sourceRuleId === 'string' ? item.sourceRuleId : null,
      sourceRuleVersion: typeof item.sourceRuleVersion === 'string' ? item.sourceRuleVersion : null,
      sourceFingerprint: String(item.sourceFingerprint ?? ''),
      traceReference: typeof item.traceReference === 'string' ? item.traceReference : null,
    }));
  return {
    revenueCode: c.revenueCode,
    status: c.status,
    reasonCode: typeof c.reasonCode === 'string' ? c.reasonCode : null,
    currency,
    total: typeof c.total === 'string' ? { amount: c.total, currency } : null,
    components,
    fingerprint: typeof c.fingerprint === 'string' ? c.fingerprint : '',
  };
}

export interface TaxObligationReadModel {
  readonly id: string;
  readonly competence: string;
  readonly taxBucket: string | null;
  readonly revenueCode: string | null;
  readonly status: TaxObligationStatus;
  readonly baseStatus: string;
  readonly reasonCode: string | null;
  readonly principalAmount: ObligationMoneyReadModel | null;
  readonly currency: string | null;
  readonly dueDate: string | null;
  readonly darfReadiness: string;
  readonly darfReadinessReason: string | null;
  readonly dataQuality: string;
  readonly liabilityFingerprint: string;
  readonly revision: number;
  readonly deadline: DeadlineSourceReadModel | null;
  readonly darfPreparation: DarfPreparationReadModel | null;
  readonly composition: ObligationCompositionReadModel | null;
  readonly payments: readonly ObligationPaymentReadModel[];
  readonly supersededById: string | null;
  readonly createdAt: string;
}

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readDeadlineSource(provenance: Record<string, unknown>): DeadlineSourceReadModel | null {
  const source = provenance.deadlineSource;
  if (!source || typeof source !== 'object') return null;
  const s = source as Record<string, unknown>;
  if (typeof s.entryId !== 'string' || typeof s.dueDate !== 'string') return null;
  return {
    entryId: s.entryId,
    dueDate: s.dueDate,
    version: typeof s.version === 'number' ? s.version : 0,
    sourceAuthority: String(s.sourceAuthority ?? ''),
    sourceDocument: String(s.sourceDocument ?? ''),
    sourceReference: String(s.sourceReference ?? ''),
    sourcePublishedAt: String(s.sourcePublishedAt ?? ''),
    verifiedAt: String(s.verifiedAt ?? ''),
  };
}

export function mapPaymentToReadModel(row: TaxPaymentEvidenceRow): ObligationPaymentReadModel {
  return {
    id: row.id,
    paidAt: isoDate(row.paidAt) ?? '',
    amount: { amount: row.amount, currency: row.currency },
    sourceType: row.sourceType,
    sourceReference: row.sourceReference,
    status: row.status,
    confirmedAt: row.confirmedAt.toISOString(),
  };
}

export function mapObligationToReadModel(
  row: TaxObligationRow,
  now: string,
  payments: readonly TaxPaymentEvidenceRow[] = [],
): TaxObligationReadModel {
  const dueDate = isoDate(row.dueDate);
  const baseStatus = row.status as TaxObligationBaseStatus;
  const status = deriveObligationDisplayStatus({ status: baseStatus, dueDate, now });
  const deadline = readDeadlineSource(row.provenance);
  const principalAmount = row.principalAmount
    ? { amount: row.principalAmount, currency: row.currency ?? '' }
    : null;

  let darfPreparation: DarfPreparationReadModel | null = null;
  if (
    row.darfReadiness === 'READY' &&
    principalAmount &&
    dueDate &&
    row.revenueCode &&
    row.taxBucket &&
    deadline
  ) {
    darfPreparation = {
      revenueCode: row.revenueCode,
      competence: row.competence,
      taxBucket: row.taxBucket,
      principalAmount,
      dueDate,
      sourceProvenance: deadline,
    };
  }

  return {
    id: row.id,
    competence: row.competence,
    taxBucket: row.taxBucket,
    revenueCode: row.revenueCode,
    status,
    baseStatus: row.status,
    reasonCode: row.reasonCode,
    principalAmount,
    currency: row.currency,
    dueDate,
    darfReadiness: row.darfReadiness,
    darfReadinessReason: row.darfReadinessReason,
    dataQuality: row.dataQuality,
    liabilityFingerprint: row.liabilityFingerprint,
    revision: row.revision,
    deadline,
    darfPreparation,
    composition: readComposition((row.provenance ?? {}) as Record<string, unknown>),
    payments: payments.map(mapPaymentToReadModel),
    supersededById: row.supersededById,
    createdAt: row.createdAt.toISOString(),
  };
}
