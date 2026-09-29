import { formatCurrency, formatDate } from '../formatters';
import { colors } from '../tokens/colors';

/**
 * Minimum-DARF payment eligibility view-model (Phase 4E).
 *
 * Presentation only. The server owns the minimum rule, aggregation, due date and
 * carry-forward semantics. This module NEVER computes amounts or totals; it
 * formats exact decimal strings and applies factual, non-alarmist labels
 * (ADR-278/279). Official DARF generation is out of scope.
 */

export interface RawEligibilityMoney {
  amount: string;
  currency: string;
}

export interface RawPaymentEligibilitySource {
  kind: 'CURRENT' | 'CARRY_FORWARD' | string;
  sourceObligationId: string | null;
  sourceCompetence: string;
  amount: RawEligibilityMoney;
  entryId: string | null;
}

export interface RawPaymentEligibility {
  status: string;
  reasonCode: string | null;
  revenueCode: string;
  targetCompetence: string;
  currency: string | null;
  currentAmount: RawEligibilityMoney | null;
  carryForwardAmount: RawEligibilityMoney | null;
  totalPayable: RawEligibilityMoney | null;
  minimumThreshold: RawEligibilityMoney | null;
  dueDate: string | null;
  sources: readonly RawPaymentEligibilitySource[];
  rule: {
    ruleId: string;
    ruleVersion: string;
    minimumAmount: RawEligibilityMoney;
    sourceDocument: string;
    verifiedAt: string;
  } | null;
  darfPreparationV2: {
    revenueCode: string;
    targetCompetence: string;
    currentPrincipal: RawEligibilityMoney | null;
    carryForwardAmount: RawEligibilityMoney | null;
    totalPayable: RawEligibilityMoney | null;
    minimumThreshold: RawEligibilityMoney;
    dueDate: string | null;
    eligibilityStatus: string;
    lateFee: RawEligibilityMoney | null;
    interest: RawEligibilityMoney | null;
    officialUpdatedAmount: RawEligibilityMoney | null;
  } | null;
  dataQuality: string;
  disclaimer: string;
}

export interface RawTaxPaymentSummary {
  competence: string;
  eligibility: RawPaymentEligibility;
  aggregation: { id: string; status: string; totalPayable: RawEligibilityMoney } | null;
  openCarryForwardEntries: readonly {
    id: string;
    sourceCompetence: string;
    amount: RawEligibilityMoney;
    status: string;
  }[];
}

export interface DarfPreparationV2ViewModel {
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currentPrincipalFormatted: string;
  readonly carryForwardFormatted: string;
  readonly totalPayableFormatted: string;
  readonly minimumThresholdFormatted: string;
  readonly dueDateFormatted: string;
  readonly eligibilityStatus: string;
  readonly lateFeeFormatted: string;
  readonly interestFormatted: string;
  readonly officialUpdatedAmountFormatted: string;
}

export interface TaxPaymentEligibilityViewModel {
  competence: string;
  competenceLabel: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  notice: string;
  currentFormatted: string;
  carryForwardFormatted: string;
  totalPayableFormatted: string;
  minimumThresholdFormatted: string;
  dueDateFormatted: string;
  breakdown: readonly { label: string; amountFormatted: string }[];
  ruleNote: string | null;
  hasCarryForward: boolean;
  isPayable: boolean;
  isDeferred: boolean;
  darfPreparationV2: DarfPreparationV2ViewModel | null;
  disclaimer: string;
  accessibilitySummary: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  PAYABLE: { label: 'Valor a pagar', color: colors.accent },
  CARRIED_FORWARD: { label: 'Abaixo do mínimo (acumulado)', color: colors.warning },
  BELOW_MINIMUM: { label: 'Abaixo do mínimo', color: colors.warning },
  BLOCKED: { label: 'Bloqueado', color: colors.negative },
  NOT_REQUIRED: { label: 'Sem imposto a recolher', color: colors.textMuted },
};

const NOTICE: Record<string, string> = {
  PAYABLE:
    'Valor acumulado de períodos anteriores (mesmo código de receita) somado ao imposto desta competência atingiu o mínimo para recolhimento.',
  CARRIED_FORWARD:
    'Valor abaixo do mínimo para recolhimento. Será acumulado para o período subsequente, no mesmo código de receita, até atingir o mínimo.',
  BELOW_MINIMUM: 'Valor abaixo do mínimo para recolhimento.',
  BLOCKED:
    'Elegibilidade de recolhimento indisponível: falta regra oficial ou apuração definitiva. Nenhum valor é estimado.',
  NOT_REQUIRED: 'Não há imposto a recolher nesta competência.',
};

function money(value: RawEligibilityMoney | null | undefined): string {
  return value ? formatCurrency(value.amount, value.currency) : '—';
}

function competenceLabel(competence: string): string {
  const [year, month] = competence.split('-');
  return `${month}/${year}`;
}

export function mapToTaxPaymentEligibilityViewModel(
  data: RawTaxPaymentSummary | null,
): TaxPaymentEligibilityViewModel | null {
  if (!data) return null;
  const e = data.eligibility;
  const status = STATUS[e.status] ?? { label: e.status, color: colors.textMuted };
  const hasCarryForward = e.carryForwardAmount !== null && e.carryForwardAmount.amount !== '0';

  const breakdown = e.sources.map((source) => ({
    label:
      source.kind === 'CURRENT'
        ? `Competência ${competenceLabel(source.sourceCompetence)} (imposto apurado)`
        : `Competência ${competenceLabel(source.sourceCompetence)} (valor acumulado)`,
    amountFormatted: money(source.amount),
  }));

  const ruleNote = e.rule
    ? `Regra: ${e.rule.sourceDocument} — mínimo ${money(e.rule.minimumAmount)} (verificada em ${formatDate(e.rule.verifiedAt)}).`
    : null;

  const prep = e.darfPreparationV2
    ? {
        revenueCode: e.darfPreparationV2.revenueCode,
        targetCompetence: e.darfPreparationV2.targetCompetence,
        currentPrincipalFormatted: money(e.darfPreparationV2.currentPrincipal),
        carryForwardFormatted: money(e.darfPreparationV2.carryForwardAmount),
        totalPayableFormatted: money(e.darfPreparationV2.totalPayable),
        minimumThresholdFormatted: money(e.darfPreparationV2.minimumThreshold),
        dueDateFormatted: e.darfPreparationV2.dueDate
          ? formatDate(e.darfPreparationV2.dueDate)
          : '—',
        eligibilityStatus: e.darfPreparationV2.eligibilityStatus,
        lateFeeFormatted: money(e.darfPreparationV2.lateFee),
        interestFormatted: money(e.darfPreparationV2.interest),
        officialUpdatedAmountFormatted: money(e.darfPreparationV2.officialUpdatedAmount),
      }
    : null;

  const accessibilitySummary =
    `Elegibilidade de recolhimento da competência ${competenceLabel(data.competence)}: ${status.label}. ` +
    `Total ${money(e.totalPayable)}. Mínimo ${money(e.minimumThreshold)}.` +
    (e.dueDate ? ` Vencimento ${formatDate(e.dueDate)}.` : '');

  return {
    competence: data.competence,
    competenceLabel: competenceLabel(data.competence),
    status: e.status,
    statusLabel: status.label,
    statusColor: status.color,
    notice: NOTICE[e.status] ?? '',
    currentFormatted: money(e.currentAmount),
    carryForwardFormatted: money(e.carryForwardAmount),
    totalPayableFormatted: money(e.totalPayable),
    minimumThresholdFormatted: money(e.minimumThreshold),
    dueDateFormatted: e.dueDate ? formatDate(e.dueDate) : '—',
    breakdown,
    ruleNote,
    hasCarryForward,
    isPayable: e.status === 'PAYABLE',
    isDeferred: e.status === 'CARRIED_FORWARD',
    darfPreparationV2: prep,
    disclaimer: e.disclaimer,
    accessibilitySummary,
  };
}

/** Query key for the minimum-DARF payment summary of a competence. */
export function taxPaymentSummaryQueryKey(competence: string): readonly string[] {
  return ['fiscal-payment-summary', competence] as const;
}

/** Query key for the minimum-DARF payment eligibility of a single obligation. */
export function taxPaymentEligibilityQueryKey(obligationId: string): readonly string[] {
  return ['fiscal-payment-eligibility', obligationId] as const;
}
