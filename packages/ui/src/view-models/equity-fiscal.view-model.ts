import { formatCurrency, formatQuantity } from '../formatters';
import { colors } from '../tokens/colors';

/**
 * Equity monthly fiscal view-model (Phase 4G.2A.1c, ADR-295).
 *
 * Presentation only. All values are server-computed exact decimal strings; the
 * client NEVER recalculates exemption, losses, taxable base, day-trade
 * classification or tax. It only formats, labels and groups.
 */

export interface RawEquityCategory {
  status: string;
  reasonCode: string | null;
  grossSales: string;
  threshold: string | null;
  exemptionStatus: string;
  matchedQuantity: string | null;
  currentResult: string;
  openingLoss: string;
  lossAdded: string;
  lossConsumed: string;
  closingLoss: string;
  taxableBaseBeforeRate: string;
  electionStatus: string;
}

export interface RawEquityCompensationElection {
  required: boolean;
  status: string;
  currentValue: string | null;
  version: number | null;
  fingerprint: string | null;
}

export interface RawEquityMonthlyFiscal {
  competence: string;
  status: string;
  reasonCode: string | null;
  normal: RawEquityCategory;
  dayTrade: RawEquityCategory;
  compensationElection: RawEquityCompensationElection;
  ruleVersions: string[];
}

export type EquityElectionValue = 'DECLARE_FOR_CARRYFORWARD' | 'DO_NOT_DECLARE';

export interface EquityCategoryVM {
  status: string;
  exemptionLabel: string;
  exemptionColor: string;
  grossSalesFormatted: string;
  thresholdFormatted: string | null;
  currentResultFormatted: string;
  openingLossFormatted: string;
  lossAddedFormatted: string;
  lossConsumedFormatted: string;
  closingLossFormatted: string;
  taxableBaseBeforeRateFormatted: string;
  matchedQuantityFormatted: string | null;
  electionStatus: string;
}

export interface EquityFiscalVM {
  competence: string;
  status: string;
  blocked: boolean;
  blockedReasonLabel: string | null;
  hasActivity: boolean;
  normal: EquityCategoryVM;
  dayTrade: EquityCategoryVM;
  election: {
    required: boolean;
    status: string;
    statusLabel: string;
    currentValue: EquityElectionValue | null;
    version: number | null;
  };
}

export function equityExemptionStatusLabel(status: string): string {
  switch (status) {
    case 'EXEMPT':
      return 'Isento pelo limite mensal';
    case 'TAXABLE':
      return 'Acima do limite mensal de isenção';
    case 'NOT_APPLICABLE':
      return 'Não aplicável';
    default:
      return status;
  }
}

function exemptionColor(status: string): string {
  if (status === 'EXEMPT') return colors.positive;
  if (status === 'TAXABLE') return colors.textPrimary;
  return colors.textMuted;
}

export function equityBlockedReasonLabel(reasonCode: string | null): string {
  switch (reasonCode) {
    case 'UNKNOWN_ASSET_TAX_CLASSIFICATION':
      return 'Há um ativo sem classificação fiscal suficiente.';
    case 'MISSING_INSTITUTION_IDENTITY':
      return 'Não foi possível identificar a instituição de uma das operações.';
    case 'MISSING_CANONICAL_COST_BASIS':
      return 'Faltam dados de custo para calcular este mês.';
    case 'EQUITY_MATCHER_FAILED':
      return 'Não foi possível classificar as operações deste mês.';
    case 'PRIOR_COMPETENCE_BLOCKED':
      return 'Um mês anterior tem dados insuficientes; o resultado não pode ser concluído.';
    default:
      return 'Dados insuficientes para concluir.';
  }
}

export function equityElectionStatusLabel(status: string): string {
  switch (status) {
    case 'NOT_REQUIRED':
      return 'Não aplicável';
    case 'ELECTION_REQUIRED':
      return 'Decisão necessária';
    case 'DECLARED':
      return 'Prejuízo reconhecido';
    case 'NOT_DECLARED':
      return 'Prejuízo não reconhecido';
    default:
      return status;
  }
}

export function equityElectionConsequenceLabel(value: EquityElectionValue): string {
  return value === 'DECLARE_FOR_CARRYFORWARD'
    ? 'O prejuízo deste mês será considerado no saldo para compensação futura.'
    : 'O prejuízo deste mês não será adicionado ao saldo de compensação futura.';
}

export function equityElectionActionLabel(value: EquityElectionValue): string {
  return value === 'DECLARE_FOR_CARRYFORWARD' ? 'Reconhecer prejuízo' : 'Não reconhecer';
}

function money(value: string, currency = 'BRL'): string {
  return formatCurrency(value, currency);
}

function categoryVM(source: RawEquityCategory): EquityCategoryVM {
  return {
    status: source.status,
    exemptionLabel: equityExemptionStatusLabel(source.exemptionStatus),
    exemptionColor: exemptionColor(source.exemptionStatus),
    grossSalesFormatted: money(source.grossSales),
    thresholdFormatted: source.threshold === null ? null : money(source.threshold),
    currentResultFormatted: money(source.currentResult),
    openingLossFormatted: money(source.openingLoss),
    lossAddedFormatted: money(source.lossAdded),
    lossConsumedFormatted: money(source.lossConsumed),
    closingLossFormatted: money(source.closingLoss),
    taxableBaseBeforeRateFormatted: money(source.taxableBaseBeforeRate),
    matchedQuantityFormatted:
      source.matchedQuantity === null ? null : formatQuantity(source.matchedQuantity),
    electionStatus: source.electionStatus,
  };
}

export function mapToEquityFiscalViewModel(
  raw: RawEquityMonthlyFiscal | null | undefined,
): EquityFiscalVM | null {
  if (!raw) return null;
  const blocked = raw.status === 'BLOCKED';
  const hasActivity =
    raw.normal.grossSales !== '0' || (raw.dayTrade.matchedQuantity ?? '0') !== '0';
  return {
    competence: raw.competence,
    status: raw.status,
    blocked,
    blockedReasonLabel: blocked ? equityBlockedReasonLabel(raw.reasonCode) : null,
    hasActivity,
    normal: categoryVM(raw.normal),
    dayTrade: categoryVM(raw.dayTrade),
    election: {
      required: raw.compensationElection.required,
      status: raw.compensationElection.status,
      statusLabel: equityElectionStatusLabel(raw.compensationElection.status),
      currentValue: raw.compensationElection.currentValue as EquityElectionValue | null,
      version: raw.compensationElection.version,
    },
  };
}

export function equityElectionQueryKey(competence: string): readonly [string, string] {
  return ['equity-exempt-loss-election', competence] as const;
}
