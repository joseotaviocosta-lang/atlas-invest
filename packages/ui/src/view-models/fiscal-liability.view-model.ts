import { formatCurrency } from '../formatters';
import { colors } from '../tokens/colors';
import {
  fiscalCategoryLabel,
  fiscalQualityIssueLabel,
  type FiscalMoney,
} from './fiscal-monthly.view-model';

/**
 * Monthly tax liability view-model (Phase 4B, ADR-240).
 *
 * Presentation only: formats server-computed liability. NEVER computes tax,
 * bases, losses, withholding or rates. A blocked/partial liability never shows
 * a fabricated zero tax due.
 */

export interface RawLiabilityCategory {
  category: string;
  currency: string;
  status: string;
  ruleVersion: string | null;
  ruleSetStatus: string | null;
  grossSales: FiscalMoney;
  realizedResult: FiscalMoney;
  taxableBaseBeforeLosses: FiscalMoney;
  openingLossBalance: FiscalMoney;
  lossApplied: FiscalMoney;
  lossGenerated: FiscalMoney;
  closingLossBalance: FiscalMoney;
  taxableBaseAfterLosses: FiscalMoney;
  ratePercentage: string | null;
  taxBeforeWithholding: FiscalMoney;
  withholdingApplied: FiscalMoney;
  taxDue: FiscalMoney | null;
  qualityIssues: string[];
  trace: Array<{
    stage: string;
    operation: string;
    status: string;
    category?: string;
    ruleVersion?: string;
    exactInputs?: Record<string, string>;
    exactOutput?: string;
  }>;
}

export interface RawMonthlyTaxLiability {
  competence: string;
  status: string;
  ruleVersions: string[];
  categories: RawLiabilityCategory[];
  totalTaxBeforeCredits: FiscalMoney | null;
  creditsApplied: FiscalMoney | null;
  taxDue: FiscalMoney | null;
  openingLossBalances: Array<{
    category: string;
    currency: string;
    amount: FiscalMoney;
    provenance: string;
  }>;
  closingLossBalances: Array<{
    category: string;
    currency: string;
    amount: FiscalMoney;
    provenance: string;
  }>;
  dataQuality: { status: string; issues: string[]; issueCount: number };
  capabilities: {
    foundationOnly: boolean;
    productionRuleVerified: boolean;
    withholdingSupported: boolean;
    taxLiabilitySupported: boolean;
  };
  calculationVersion: string;
  engineVersion: string;
  limitations: string[];
  traceSummary: Array<{
    stage: string;
    operation: string;
    status: string;
    category?: string;
    ruleVersion?: string;
    exactInputs?: Record<string, string>;
    exactOutput?: string;
  }>;
}

export interface LiabilityCategoryVM {
  categoryLabel: string;
  currency: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  ruleVersion: string | null;
  grossSalesFormatted: string;
  realizedResultFormatted: string;
  taxableBaseBeforeLossesFormatted: string;
  openingLossFormatted: string;
  lossAppliedFormatted: string;
  lossGeneratedFormatted: string;
  closingLossFormatted: string;
  taxableBaseAfterLossesFormatted: string;
  rateFormatted: string;
  taxBeforeWithholdingFormatted: string;
  withholdingAppliedFormatted: string;
  taxDueFormatted: string;
  qualityLabels: string[];
  trace: Array<{
    stage: string;
    operation: string;
    status: string;
    category?: string;
    ruleVersion?: string;
    output: string;
  }>;
}

export interface TaxLossBalanceVM {
  categoryLabel: string;
  currency: string;
  amountFormatted: string;
  provenance: string;
}

export interface MonthlyTaxLiabilityViewModel {
  competence: string;
  competenceLabel: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  isComplete: boolean;
  isPartial: boolean;
  isBlocked: boolean;
  isNoActivity: boolean;
  hasTaxDue: boolean;
  taxDueFormatted: string;
  productionRuleVerified: boolean;
  categories: LiabilityCategoryVM[];
  openingLosses: TaxLossBalanceVM[];
  closingLosses: TaxLossBalanceVM[];
  qualityLabels: string[];
  limitations: string[];
  trace: Array<{
    stage: string;
    operation: string;
    status: string;
    category?: string;
    ruleVersion?: string;
    output: string;
  }>;
  disclaimer: string;
  accessibilitySummary: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  COMPLETE: { label: 'Apuração concluída', color: colors.positive },
  PARTIAL: { label: 'Apuração parcial', color: colors.warning },
  BLOCKED: { label: 'Apuração bloqueada', color: colors.negative },
  NO_ACTIVITY: { label: 'Sem atividade tributável', color: colors.textMuted },
};

function money(value: FiscalMoney | null): string {
  return value ? formatCurrency(value.amount, value.currency) : '—';
}

export function mapToMonthlyTaxLiabilityViewModel(
  data: RawMonthlyTaxLiability | null,
): MonthlyTaxLiabilityViewModel | null {
  if (!data) return null;

  const status = STATUS[data.status] ?? { label: data.status, color: colors.textMuted };
  const [year, month] = data.competence.split('-');

  const categories: LiabilityCategoryVM[] = data.categories.map((c) => ({
    categoryLabel: fiscalCategoryLabel(c.category),
    currency: c.currency,
    status: c.status,
    statusLabel: STATUS[c.status]?.label ?? c.status,
    statusColor: STATUS[c.status]?.color ?? colors.textMuted,
    ruleVersion: c.ruleVersion,
    grossSalesFormatted: money(c.grossSales),
    realizedResultFormatted: money(c.realizedResult),
    taxableBaseBeforeLossesFormatted: money(c.taxableBaseBeforeLosses),
    openingLossFormatted: money(c.openingLossBalance),
    lossAppliedFormatted: money(c.lossApplied),
    lossGeneratedFormatted: money(c.lossGenerated),
    closingLossFormatted: money(c.closingLossBalance),
    taxableBaseAfterLossesFormatted: money(c.taxableBaseAfterLosses),
    rateFormatted: c.ratePercentage === null ? '—' : `${c.ratePercentage}%`,
    taxBeforeWithholdingFormatted: money(c.taxBeforeWithholding),
    withholdingAppliedFormatted: money(c.withholdingApplied),
    taxDueFormatted: c.taxDue ? money(c.taxDue) : '—',
    qualityLabels: (c.qualityIssues ?? []).map(fiscalQualityIssueLabel),
    trace: (c.trace ?? []).map((t) => ({
      stage: t.stage,
      operation: t.operation,
      status: t.status,
      ...(t.category ? { category: fiscalCategoryLabel(t.category) } : {}),
      ...(t.ruleVersion ? { ruleVersion: t.ruleVersion } : {}),
      output: t.exactOutput ?? '',
    })),
  }));

  const lossVm = (b: RawMonthlyTaxLiability['openingLossBalances']): TaxLossBalanceVM[] =>
    b.map((x) => ({
      categoryLabel: fiscalCategoryLabel(x.category),
      currency: x.currency,
      amountFormatted: money(x.amount),
      provenance: x.provenance,
    }));

  const qualityLabels = (data.dataQuality.issues ?? []).map(fiscalQualityIssueLabel);

  const disclaimer =
    'Apuração fiscal (Fase 4B). Valores calculados exclusivamente pelo Tax Engine a partir do ' +
    'livro-razão canônico e de regras vigentes verificadas. Não gera DARF, pagamento ou declaração.';

  const trace = (data.traceSummary ?? []).map((t) => ({
    stage: t.stage,
    operation: t.operation,
    status: t.status,
    ...(t.category ? { category: fiscalCategoryLabel(t.category) } : {}),
    ...(t.ruleVersion ? { ruleVersion: t.ruleVersion } : {}),
    output: t.exactOutput ?? '',
  }));

  const accessibilitySummary =
    `Competência ${month}/${year}: ${status.label}. ` +
    (data.taxDue
      ? `Imposto calculado ${money(data.taxDue)}. `
      : 'Imposto calculado indisponível. ') +
    (qualityLabels.length > 0 ? `Pendências: ${qualityLabels.join('; ')}.` : '');

  return {
    competence: data.competence,
    competenceLabel: `${month}/${year}`,
    status: data.status,
    statusLabel: status.label,
    statusColor: status.color,
    isComplete: data.status === 'COMPLETE',
    isPartial: data.status === 'PARTIAL',
    isBlocked: data.status === 'BLOCKED',
    isNoActivity: data.status === 'NO_ACTIVITY',
    hasTaxDue: data.taxDue !== null,
    taxDueFormatted: data.taxDue ? money(data.taxDue) : '—',
    productionRuleVerified: data.capabilities.productionRuleVerified,
    categories,
    openingLosses: lossVm(data.openingLossBalances ?? []),
    closingLosses: lossVm(data.closingLossBalances ?? []),
    qualityLabels,
    limitations: data.limitations ?? [],
    trace,
    disclaimer,
    accessibilitySummary,
  };
}

export function taxLiabilityQueryKey(competence: string): readonly string[] {
  return ['fiscal-liability', competence] as const;
}
