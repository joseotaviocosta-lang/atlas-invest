import { formatCurrency, formatDate } from '../formatters';
import { colors } from '../tokens/colors';
import type { FiscalMoney } from './fiscal-monthly.view-model';

/**
 * Tax obligation view-model (Phase 4C.2).
 *
 * Presentation only. The server owns tax, due dates, overdue and DARF
 * readiness. This module NEVER computes amounts, dates or status; it formats
 * exact decimal strings and applies factual labels. DARF readiness is not DARF
 * generation (ADR-265).
 */

export interface RawObligationMoney {
  amount: string;
  currency: string;
}

export interface RawDeadlineSource {
  entryId: string;
  dueDate: string;
  version: number;
  sourceAuthority: string;
  sourceDocument: string;
  sourceReference: string;
  sourcePublishedAt: string;
  verifiedAt: string;
}

export interface RawTaxObligation {
  id: string;
  competence: string;
  taxBucket: string | null;
  revenueCode: string | null;
  status: string;
  baseStatus: string;
  reasonCode: string | null;
  principalAmount: RawObligationMoney | null;
  currency: string | null;
  dueDate: string | null;
  darfReadiness: string;
  darfReadinessReason: string | null;
  dataQuality: string;
  liabilityFingerprint: string;
  revision: number;
  deadline: RawDeadlineSource | null;
  darfPreparation: {
    revenueCode: string;
    competence: string;
    taxBucket: string;
    principalAmount: RawObligationMoney;
    dueDate: string;
    sourceProvenance: RawDeadlineSource;
  } | null;
  payments: Array<{
    id: string;
    paidAt: string;
    amount: RawObligationMoney;
    sourceType: string;
    sourceReference: string | null;
    status: string;
    confirmedAt: string;
  }>;
  supersededById: string | null;
  createdAt: string;
}

export interface TaxObligationViewModel {
  id: string;
  competence: string;
  competenceLabel: string;
  bucketLabel: string;
  revenueCode: string | null;
  status: string;
  statusLabel: string;
  statusColor: string;
  reasonCode: string | null;
  principalFormatted: string;
  currency: string | null;
  dueDateFormatted: string;
  darfReadiness: string;
  darfReadinessLabel: string;
  darfReadinessColor: string;
  darfReadinessNotice: string;
  isDarfReady: boolean;
  sourceNote: string | null;
  sourceDocument: string | null;
  paymentsCount: number;
  paidFormatted: string | null;
  accessibilitySummary: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: colors.accent },
  DUE: { label: 'Vence hoje', color: colors.warning },
  OVERDUE: { label: 'Vencido', color: colors.negative },
  PAID: { label: 'Pago', color: colors.positive },
  NO_PAYMENT_DUE: { label: 'Sem imposto a recolher', color: colors.textMuted },
  BLOCKED: { label: 'Bloqueado', color: colors.warning },
  PROVISIONAL: { label: 'Provisório', color: colors.textMuted },
  SUPERSEDED: { label: 'Substituído', color: colors.textMuted },
  RECONCILIATION_REQUIRED: { label: 'Revisão necessária', color: colors.warning },
};

const DARF: Record<string, { label: string; color: string }> = {
  READY: { label: 'Prontos', color: colors.positive },
  PARTIAL: { label: 'Pendentes', color: colors.warning },
  BLOCKED: { label: 'Bloqueados', color: colors.negative },
  NOT_REQUIRED: { label: 'Não aplicável', color: colors.textMuted },
};

const DARF_NOTICE: Record<string, string> = {
  READY: 'Dados para pagamento prontos (a geração do DARF oficial não é feita pelo Atlas).',
  PARTIAL: 'Dados para pagamento pendentes: competência ainda em apuração.',
  BLOCKED: 'Dados para pagamento bloqueados: falta autoridade oficial ou apuração definitiva.',
  NOT_REQUIRED: 'Não há imposto a recolher nesta competência.',
};

function money(value: RawObligationMoney | null): string {
  return value ? formatCurrency(value.amount, value.currency) : '—';
}

// FII_SALE is the sole canonical bucket for revenue code 6015
// ("Ganhos líquidos em operações em bolsa"), which aggregates FII, normal
// equity and day-trade category taxes. The label stays generic on purpose:
// per-category truth lives in the 6015 composition breakdown, never in the
// bucket name. Engine bucket identity is intentionally untouched.
const BUCKET_LABELS: Record<string, string> = {
  FII_SALE: 'DARF 6015 — Renda variável',
};

export function taxObligationBucketLabel(bucket: string | null): string {
  if (!bucket) return '—';
  return BUCKET_LABELS[bucket] ?? bucket;
}

export function mapToTaxObligationViewModel(
  data: RawTaxObligation | null,
): TaxObligationViewModel | null {
  if (!data) return null;

  const status = STATUS[data.status] ?? { label: data.status, color: colors.textMuted };
  const darf = DARF[data.darfReadiness] ?? {
    label: data.darfReadiness,
    color: colors.textMuted,
  };
  const [year, month] = data.competence.split('-');
  const paid = data.payments.length > 0 ? data.payments[data.payments.length - 1]! : null;

  const sourceNote = data.deadline
    ? 'Vencimento oficial conforme Agenda Tributária da Receita Federal'
    : null;

  const accessibilitySummary =
    `Obrigação ${month}/${year}: ${status.label}. ` +
    (data.principalAmount ? `Valor principal ${money(data.principalAmount)}. ` : '') +
    (data.dueDate ? `Vencimento ${formatDate(data.dueDate)}. ` : '') +
    `Dados para pagamento: ${darf.label}.`;

  return {
    id: data.id,
    competence: data.competence,
    competenceLabel: `${month}/${year}`,
    bucketLabel: taxObligationBucketLabel(data.taxBucket),
    revenueCode: data.revenueCode,
    status: data.status,
    statusLabel: status.label,
    statusColor: status.color,
    reasonCode: data.reasonCode,
    principalFormatted: money(data.principalAmount),
    currency: data.currency,
    dueDateFormatted: data.dueDate ? formatDate(data.dueDate) : '—',
    darfReadiness: data.darfReadiness,
    darfReadinessLabel: darf.label,
    darfReadinessColor: darf.color,
    darfReadinessNotice: DARF_NOTICE[data.darfReadiness] ?? '',
    isDarfReady: data.darfReadiness === 'READY',
    sourceNote,
    sourceDocument: data.deadline?.sourceDocument ?? null,
    paymentsCount: data.payments.length,
    paidFormatted: paid ? money(paid.amount) : null,
    accessibilitySummary,
  };
}

/** Query key for the read-through materialized obligation of a competence. */
export function taxObligationQueryKey(competence: string): readonly string[] {
  return ['fiscal-obligation', competence] as const;
}

/** Query key for the persisted obligation list. */
export function taxObligationsQueryKey(competence: string): readonly string[] {
  return ['fiscal-obligations', competence] as const;
}

export type { FiscalMoney };
