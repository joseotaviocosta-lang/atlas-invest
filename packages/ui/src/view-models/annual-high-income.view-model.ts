import { formatCurrency, formatPercentage } from '../formatters';

export function annualHighIncomeQueryKey(calendarYear: number | string): readonly string[] {
  return ['fiscal', 'annual', String(calendarYear), 'high-income'];
}

export interface RawHighIncomeCredit {
  readonly kind: string;
  readonly role: string;
  readonly supported: boolean;
  readonly provided: boolean;
  readonly amount: string | null;
  readonly applied: boolean;
  readonly requiredForNet: boolean;
  readonly legalReference: string;
  readonly reason: string;
}

export interface RawHighIncomeBreakdownEntry {
  readonly category: string;
  readonly classification: string;
  readonly grossAmount: string;
  readonly includedAmount: string;
  readonly excludedAmount: string;
  readonly itemCount: number;
  readonly payerIds: readonly string[];
  readonly reason: string;
  readonly legalReference: string;
}

export interface RawHighIncomePayerRedutor {
  readonly payerId: string;
  readonly payerType: string;
  readonly status: string;
  readonly referenceRatePercentage: string | null;
  readonly corporateEffectiveRatePercentage: string | null;
  readonly pfEffectiveRatePercentage: string;
  readonly eligibleDividends: string;
  readonly reductionExact: string;
  readonly evidenceStatus: string;
  readonly blockingReasons: readonly string[];
  readonly sourceFingerprint: string | null;
}

export interface RawHighIncomeCorporateRedutor {
  readonly aggregateVersion: string;
  readonly payerCount: number;
  readonly computedPayerCount: number;
  readonly status: string;
  readonly totalEligibleDividends: string;
  readonly totalReductionExact: string;
  readonly totalSupportedReduction: string | null;
  readonly payers: readonly RawHighIncomePayerRedutor[];
  readonly blockingPayers: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

export interface RawHighIncomeEvidenceRequirement {
  readonly requirementId: string;
  readonly requirement: string;
  readonly subjectId: string;
  readonly title: string;
  readonly status: string;
  readonly legalReference: string;
  readonly blockingReason: string | null;
}

export interface RawHighIncomeEvidenceState {
  readonly id: string;
  readonly evidenceType: string;
  readonly payerId: string | null;
  readonly authority: string;
  readonly evidenceSource: string;
  readonly conflictStatus: string;
  readonly stale: boolean;
  readonly revision: number;
  readonly supersedesId: string | null;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface RawAnnualHighIncomeAssessment {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersion: string;
  readonly status: string;
  readonly applicability: string;
  readonly totalAnnualIncome: string | null;
  readonly applicabilityThreshold: string | null;
  readonly minimumTaxBase: string | null;
  readonly rateBand: string | null;
  readonly minimumRatePercentage: string | null;
  readonly grossMinimumTax: string | null;
  readonly credits: readonly RawHighIncomeCredit[];
  readonly supportedCreditsTotal: string | null;
  readonly reductions: readonly RawHighIncomeCredit[];
  readonly supportedReductionsTotal: string | null;
  readonly corporateRedutor: RawHighIncomeCorporateRedutor | null;
  readonly netMinimumTax: string | null;
  readonly creditExcess: string | null;
  readonly incomeBreakdown: readonly RawHighIncomeBreakdownEntry[];
  readonly evidenceRequirements: readonly RawHighIncomeEvidenceRequirement[];
  readonly evidence: readonly RawHighIncomeEvidenceState[];
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly upstreamIncomeStatus: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamCapitalMarketFingerprint: string;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

export interface FormattedHighIncomeCreditViewModel extends RawHighIncomeCredit {
  readonly formattedAmount: string;
  readonly reasonLabel: string;
}

export interface FormattedHighIncomeBreakdownViewModel extends RawHighIncomeBreakdownEntry {
  readonly categoryLabel: string;
  readonly classificationLabel: string;
  readonly formattedGrossAmount: string;
  readonly formattedIncludedAmount: string;
  readonly formattedExcludedAmount: string;
}

export interface FormattedHighIncomePayerViewModel extends RawHighIncomePayerRedutor {
  readonly payerTypeLabel: string;
  readonly statusLabel: string;
  readonly formattedEligibleDividends: string;
  readonly formattedReductionExact: string;
  readonly formattedCorporateEffectiveRate: string;
  readonly formattedReferenceRate: string;
  readonly formattedPfEffectiveRate: string;
  readonly evidenceStatusLabel: string;
}

export interface FormattedHighIncomeEvidenceRequirementViewModel extends RawHighIncomeEvidenceRequirement {
  readonly statusLabel: string;
}

export interface FormattedHighIncomeEvidenceStateViewModel extends RawHighIncomeEvidenceState {
  readonly evidenceTypeLabel: string;
  readonly authorityLabel: string;
  readonly sourceLabel: string;
  readonly conflictLabel: string | null;
}

export interface AnnualHighIncomeViewModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersion: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly isAuthoritativeNet: boolean;
  readonly applicability: string;
  readonly applicabilityLabel: string;
  readonly formattedTotalAnnualIncome: string;
  readonly formattedApplicabilityThreshold: string;
  readonly formattedMinimumTaxBase: string;
  readonly rateBand: string | null;
  readonly rateBandLabel: string | null;
  readonly formattedMinimumRate: string;
  readonly formattedGrossMinimumTax: string;
  readonly credits: readonly FormattedHighIncomeCreditViewModel[];
  readonly formattedSupportedCreditsTotal: string;
  readonly formattedSupportedReductionsTotal: string;
  readonly corporateRedutor: {
    readonly aggregateVersion: string;
    readonly payerCount: number;
    readonly computedPayerCount: number;
    readonly status: string;
    readonly statusLabel: string;
    readonly formattedTotalEligibleDividends: string;
    readonly formattedTotalReductionExact: string;
    readonly formattedTotalSupportedReduction: string;
    readonly payers: readonly FormattedHighIncomePayerViewModel[];
    readonly blockingPayers: readonly string[];
    readonly blockingReasons: readonly string[];
  } | null;
  readonly formattedNetMinimumTax: string;
  readonly formattedCreditExcess: string | null;
  readonly incomeBreakdown: readonly FormattedHighIncomeBreakdownViewModel[];
  readonly evidenceRequirements: readonly FormattedHighIncomeEvidenceRequirementViewModel[];
  readonly evidence: readonly FormattedHighIncomeEvidenceStateViewModel[];
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly upstreamIncomeStatus: string;
  readonly readinessProgress: { readonly completed: number; readonly total: number } | null;
  readonly blockerPriority: readonly string[];
}

export function highIncomeStatusLabel(status: string): string {
  switch (status) {
    case 'NOT_APPLICABLE':
      return 'Não aplicável';
    case 'CALCULABLE':
      return 'Apurado pelo Atlas';
    case 'INCOMPLETE_CREDITS':
      return 'Créditos pendentes';
    case 'INCOMPLETE_REDUCTION_DATA':
      return 'Evidência corporativa pendente';
    case 'REQUIRES_CONFIRMATION':
      return 'Requer confirmação';
    case 'BLOCKED':
      return 'Bloqueado';
    case 'UNSUPPORTED_YEAR':
      return 'Ano não suportado';
    case 'UNSUPPORTED_INPUT':
      return 'Dados não suportados';
    default:
      return 'Status desconhecido';
  }
}

export function highIncomeClassificationLabel(classification: string): string {
  switch (classification) {
    case 'INCLUDED':
      return 'Incluído na base';
    case 'EXCLUDED':
      return 'Excluído da base (hipótese legal)';
    case 'CONDITIONAL':
      return 'Condicional — depende de comprovação';
    case 'REQUIRES_CONFIRMATION':
      return 'Requer confirmação';
    case 'UNSUPPORTED':
      return 'Sem suporte no Atlas';
    default:
      return 'Classificação desconhecida';
  }
}

export function highIncomeCategoryLabel(category: string): string {
  switch (category) {
    case 'DIVIDEND':
      return 'Dividendos (ordinários)';
    case 'DIVIDEND_TRANSITION':
      return 'Dividendos de transição (pré-2026)';
    case 'JCP':
      return 'Juros sobre Capital Próprio (JCP)';
    case 'FII_INCOME':
      return 'Rendimentos de FII';
    case 'EQUITY_CAPITAL_GAIN':
      return 'Ações — operações comuns (ganho líquido)';
    case 'EQUITY_DAY_TRADE_GAIN':
      return 'Day trade (ganho líquido)';
    case 'FII_CAPITAL_GAIN':
      return 'FII — ganho de capital (bolsa)';
    case 'EXCLUSIVE_WITHHOLDING_INCOME':
      return 'Rendimentos de tributação exclusiva/definitiva';
    case 'SAVINGS_INCOME':
      return 'Poupança';
    case 'EXEMPT_SECURITIES_INCOME':
      return 'Títulos isentos / alíquota zero';
    case 'FOREIGN_INCOME':
      return 'Rendimentos no exterior';
    case 'RURAL_ACTIVITY':
      return 'Atividade rural';
    case 'DONATION_INHERITANCE':
      return 'Doação / herança';
    case 'INDEMNITY':
      return 'Indenizações';
    default:
      return 'Categoria desconhecida';
  }
}

export function highIncomePayerTypeLabel(payerType: string): string {
  switch (payerType) {
    case 'STANDARD_CORPORATE':
      return 'Empresa — regime geral (teto 34%)';
    case 'INSURANCE_CAPITALIZATION_REGULATED':
      return 'Seguradora / capitalização (teto 40%)';
    case 'FINANCIAL_INSTITUTION':
      return 'Instituição financeira (teto 45%)';
    default:
      return 'Tipo de pagador desconhecido';
  }
}

export function highIncomePayerStatusLabel(status: string): string {
  switch (status) {
    case 'APPLICABLE':
      return 'Redutor apurado';
    case 'NOT_APPLICABLE':
      return 'Redutor não aplicável';
    case 'REQUIRES_EVIDENCE':
      return 'Evidência necessária';
    case 'BLOCKED':
      return 'Bloqueado';
    case 'UNSUPPORTED_PAYER_TYPE':
      return 'Tipo de pagador não suportado';
    case 'UNSUPPORTED_YEAR':
      return 'Ano não suportado';
    default:
      return 'Status desconhecido';
  }
}

export function highIncomeEvidenceStatusLabel(status: string): string {
  switch (status) {
    case 'AUTHORITATIVE':
      return 'Comprovação válida';
    case 'REQUIRES_CONFIRMATION':
      return 'Aguardando comprovação';
    case 'MISSING':
      return 'Ausente';
    case 'CONFLICTING':
      return 'Conflitante';
    case 'UNSUPPORTED':
      return 'Não suportado';
    default:
      return 'Estado desconhecido';
  }
}

export function highIncomeEvidenceTypeLabel(evidenceType: string): string {
  switch (evidenceType) {
    case 'CORPORATE_TAX':
      return 'Evidência tributária da fonte pagadora';
    case 'ANNUAL_ADJUSTMENT_IRPF':
      return 'IRPF do ajuste anual';
    case 'ANNUAL_INCOME_TOTAL':
      return 'Total anual de rendimentos';
    default:
      return 'Evidência desconhecida';
  }
}

export function highIncomeEvidenceSourceLabel(source: string): string {
  switch (source) {
    case 'PJ_FINANCIAL_STATEMENTS':
      return 'Demonstrações financeiras da pagadora';
    case 'RFB_PREFILLED':
      return 'Declaração pré-preenchida (RFB)';
    case 'TAXPAYER_CONFIRMED':
      return 'Atestado pelo contribuinte';
    default:
      return 'Origem desconhecida';
  }
}

export function highIncomeCreditReasonLabel(reason: string): string {
  switch (reason) {
    case 'APPLIED':
      return 'Considerado no cálculo';
    case 'REQUIRED_FOR_NET_MISSING':
      return 'Necessário para o líquido — ausente';
    case 'OPTIONAL_NOT_PROVIDED':
      return 'Não informado';
    case 'UNSUPPORTED_BY_FROZEN_FOUNDATION':
      return 'Sem suporte nesta fase';
    case 'NOT_APPLIED':
      return 'Não aplicado';
    default:
      return 'Situação desconhecida';
  }
}

const BLOCKER_PRIORITY_ORDER = [
  'BLOCKED',
  'CONFLICTING',
  'MISSING',
  'STALE',
  'REQUIRES_CONFIRMATION',
  'UNSUPPORTED',
];

export function highIncomeBlockerPriorityKey(reason: string): number {
  const upper = reason.toUpperCase();
  for (let index = 0; index < BLOCKER_PRIORITY_ORDER.length; index++) {
    if (upper.includes(BLOCKER_PRIORITY_ORDER[index]!)) {
      return index;
    }
  }
  return BLOCKER_PRIORITY_ORDER.length;
}

function orderBlockers(reasons: readonly string[]): readonly string[] {
  return [...reasons].sort(
    (a, b) => highIncomeBlockerPriorityKey(a) - highIncomeBlockerPriorityKey(b),
  );
}

function money(value: string | null | undefined, currency: string): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return formatCurrency(value, currency);
}

function rate(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return formatPercentage(value, {});
}

export function formatAnnualHighIncomeViewModel(
  data: RawAnnualHighIncomeAssessment | null | undefined,
): AnnualHighIncomeViewModel | null {
  if (
    !data ||
    Array.isArray(data) ||
    typeof data !== 'object' ||
    typeof data.calendarYear !== 'number' ||
    typeof data.status !== 'string' ||
    !Array.isArray(data.incomeBreakdown) ||
    !Array.isArray(data.credits) ||
    !Array.isArray(data.evidenceRequirements) ||
    !Array.isArray(data.evidence)
  ) {
    return null;
  }

  const currency = 'BRL';
  const isAuthoritativeNet =
    data.status === 'CALCULABLE' && data.netMinimumTax !== null && data.netMinimumTax !== undefined;

  const readinessTotal = data.evidenceRequirements.length;
  const readinessCompleted = data.evidenceRequirements.filter(
    (requirement) => requirement.status === 'SATISFIED',
  ).length;

  return {
    calendarYear: data.calendarYear,
    declarationExercise: data.declarationExercise,
    ruleVersion: data.ruleVersion,
    status: data.status,
    statusLabel: highIncomeStatusLabel(data.status),
    isAuthoritativeNet,
    applicability: data.applicability,
    applicabilityLabel: highIncomeStatusLabel(data.applicability),
    formattedTotalAnnualIncome: money(data.totalAnnualIncome, currency),
    formattedApplicabilityThreshold: money(data.applicabilityThreshold, currency),
    formattedMinimumTaxBase: money(data.minimumTaxBase, currency),
    rateBand: data.rateBand,
    rateBandLabel:
      data.rateBand === 'TRANSITION'
        ? 'Faixa de transição (0% a 10%)'
        : data.rateBand === 'MAXIMUM'
          ? 'Alíquota máxima (10%)'
          : data.rateBand === 'BELOW_THRESHOLD'
            ? 'Abaixo do limiar'
            : null,
    formattedMinimumRate: rate(data.minimumRatePercentage),
    formattedGrossMinimumTax: money(data.grossMinimumTax, currency),
    credits: data.credits.map((credit) => ({
      ...credit,
      formattedAmount: money(credit.amount, currency),
      reasonLabel: highIncomeCreditReasonLabel(credit.reason),
    })),
    formattedSupportedCreditsTotal: money(data.supportedCreditsTotal, currency),
    formattedSupportedReductionsTotal: money(data.supportedReductionsTotal, currency),
    corporateRedutor: data.corporateRedutor
      ? {
          aggregateVersion: data.corporateRedutor.aggregateVersion,
          payerCount: data.corporateRedutor.payerCount,
          computedPayerCount: data.corporateRedutor.computedPayerCount,
          status: data.corporateRedutor.status,
          statusLabel: highIncomePayerStatusLabel(data.corporateRedutor.status),
          formattedTotalEligibleDividends: money(
            data.corporateRedutor.totalEligibleDividends,
            currency,
          ),
          formattedTotalReductionExact: money(data.corporateRedutor.totalReductionExact, currency),
          formattedTotalSupportedReduction: money(
            data.corporateRedutor.totalSupportedReduction,
            currency,
          ),
          payers: data.corporateRedutor.payers.map((payer) => ({
            ...payer,
            payerTypeLabel: highIncomePayerTypeLabel(payer.payerType),
            statusLabel: highIncomePayerStatusLabel(payer.status),
            formattedEligibleDividends: money(payer.eligibleDividends, currency),
            formattedReductionExact: money(payer.reductionExact, currency),
            formattedCorporateEffectiveRate: rate(payer.corporateEffectiveRatePercentage),
            formattedReferenceRate: rate(payer.referenceRatePercentage),
            formattedPfEffectiveRate: rate(payer.pfEffectiveRatePercentage),
            evidenceStatusLabel: highIncomeEvidenceStatusLabel(payer.evidenceStatus),
          })),
          blockingPayers: data.corporateRedutor.blockingPayers,
          blockingReasons: data.corporateRedutor.blockingReasons,
        }
      : null,
    formattedNetMinimumTax: money(data.netMinimumTax, currency),
    formattedCreditExcess:
      data.creditExcess === null || data.creditExcess === undefined
        ? null
        : money(data.creditExcess, currency),
    incomeBreakdown: data.incomeBreakdown.map((entry) => ({
      ...entry,
      categoryLabel: highIncomeCategoryLabel(entry.category),
      classificationLabel: highIncomeClassificationLabel(entry.classification),
      formattedGrossAmount: money(entry.grossAmount, currency),
      formattedIncludedAmount: money(entry.includedAmount, currency),
      formattedExcludedAmount: money(entry.excludedAmount, currency),
    })),
    evidenceRequirements: data.evidenceRequirements.map((requirement) => ({
      ...requirement,
      statusLabel: highIncomeEvidenceStatusLabel(requirement.status),
    })),
    evidence: data.evidence.map((row) => ({
      ...row,
      evidenceTypeLabel: highIncomeEvidenceTypeLabel(row.evidenceType),
      authorityLabel: highIncomeEvidenceStatusLabel(row.authority),
      sourceLabel: highIncomeEvidenceSourceLabel(row.evidenceSource),
      conflictLabel: row.conflictStatus === 'CONFLICT' ? 'Conflitante' : null,
    })),
    blockingReasons: data.blockingReasons,
    limitations: data.limitations,
    upstreamIncomeStatus: data.upstreamIncomeStatus,
    readinessProgress:
      readinessTotal > 0 ? { completed: readinessCompleted, total: readinessTotal } : null,
    blockerPriority: orderBlockers(data.blockingReasons),
  };
}
