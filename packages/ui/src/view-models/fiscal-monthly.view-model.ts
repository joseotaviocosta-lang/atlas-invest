import { formatCurrency } from '../formatters';
import { colors } from '../tokens/colors';

/**
 * Monthly fiscal state view-model (Phase 4A, ADR-240).
 *
 * Presentation only: renders server-computed fiscal facts. NEVER computes tax,
 * tax bases, losses, withholding or liability. No `taxDue` is ever produced —
 * Phase 4A establishes the foundation and does not calculate payable tax.
 */

export interface FiscalMoney {
  amount: string;
  currency: string;
}

export interface RawFiscalCategory {
  category: string;
  currency: string;
  capability: string;
  eventCount: number;
  salesProceeds: FiscalMoney | null;
  realizedGain: FiscalMoney | null;
  realizedLoss: FiscalMoney | null;
  income: FiscalMoney | null;
  withholding: FiscalMoney | null;
  qualityIssues: string[];
}

export interface RawFiscalEvent {
  id: string;
  sourceTransactionId: string;
  economicDate: string;
  competence: string;
  sourceTransactionType: string;
  eventType: string;
  relevance: string;
  taxAssetCategory: string;
  currency: string;
  quantity: string | null;
  qualityIssues: string[];
}

export interface RawFiscalMonthlyState {
  competence: string;
  status: string;
  eventCount: number;
  currencies: string[];
  categories: RawFiscalCategory[];
  events: RawFiscalEvent[];
  dataQuality: { status: string; issues: string[]; issueCount: number };
  ruleSetVersion: string | null;
  ruleSetStatus: string | null;
  capabilities: {
    foundationOnly: boolean;
    productionRuleVerified: boolean;
    withholdingSupported: boolean;
    taxLiabilitySupported: boolean;
  };
  projectionVersion: string;
  engineVersion: string;
}

export interface FiscalCategoryVM {
  categoryLabel: string;
  currency: string;
  capability: string;
  capabilityLabel: string;
  capabilityColor: string;
  eventCount: number;
  hasFinancialData: boolean;
  salesProceedsFormatted: string;
  realizedGainFormatted: string;
  realizedLossFormatted: string;
  incomeFormatted: string;
  qualityLabels: string[];
}

export interface FiscalEventSummaryVM {
  eventType: string;
  label: string;
  count: number;
}

export interface FiscalMonthlyViewModel {
  competence: string;
  competenceLabel: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  isEmpty: boolean;
  isComplete: boolean;
  isPartial: boolean;
  isBlocked: boolean;
  eventCount: number;
  currencies: string[];
  categories: FiscalCategoryVM[];
  eventsSummary: FiscalEventSummaryVM[];
  dataQuality: { hasIssues: boolean; issueLabels: string[] };
  ruleSetVersion: string | null;
  ruleSetLabel: string;
  foundationNotice: string;
  accessibilitySummary: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  BRAZILIAN_EQUITY: 'Ações brasileiras',
  FII: 'Fundos imobiliários (FII)',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda fixa',
  UNKNOWN: 'Não classificado',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venda',
  INCOME: 'Provento',
  TRANSFER_IN: 'Transferência (entrada)',
  TRANSFER_OUT: 'Transferência (saída)',
  CORPORATE_ACTION: 'Ação societária',
  AMORTIZATION: 'Amortização (devolução de capital)',
  EXPENSE: 'Despesa',
  CASH_FLOW: 'Movimentação de caixa',
  WITHHOLDING: 'Retenção',
  OTHER: 'Outro',
};

const QUALITY_ISSUE_LABELS: Record<string, string> = {
  UNKNOWN_COST_BASIS: 'Custo de aquisição incompleto',
  UNKNOWN_ASSET_TAX_CATEGORY: 'Categoria fiscal do ativo não identificada',
  UNSUPPORTED_CURRENCY: 'Moeda sem tratamento fiscal completo',
  MISSING_RULE_SET: 'Sem conjunto de regras vigente',
  INCOMPLETE_HISTORY: 'Histórico de aquisição incompleto',
  MISSING_PROCEEDS: 'Valor de venda indisponível',
  UNVERIFIED_RULE_SET: 'Regra fiscal não verificada',
  UNKNOWN_OPENING_LOSS_BALANCE: 'Saldo de prejuízo anterior desconhecido',
  MISSING_REQUIRED_WITHHOLDING: 'Retenção/IRRF obrigatória ausente',
  MISSING_RATE_RULE: 'Regra de alíquota ausente',
  UNKNOWN_TRADE_CLASSIFICATION: 'Classificação de operações desconhecida',
  MISSING_WITHHOLDING_INPUT: 'Retenção/IRRF ausente',
  UNVERIFIED_WITHHOLDING: 'Retenção/IRRF não confirmada',
  MISSING_FII_ELIGIBILITY_METADATA: 'Dados fiscais de FII incompletos',
  STALE_FII_ELIGIBILITY_METADATA: 'Dados fiscais de FII desatualizados',
};

export function fiscalCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function fiscalEventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function fiscalQualityIssueLabel(code: string): string {
  return QUALITY_ISSUE_LABELS[code] ?? code;
}

function capabilityPresentation(capability: string): { label: string; color: string } {
  switch (capability) {
    case 'CALCULABLE':
      return { label: 'Calculável', color: colors.positive };
    case 'PARTIAL':
      return { label: 'Parcial', color: colors.warning };
    case 'UNSUPPORTED':
      return { label: 'Não suportado nesta fase', color: colors.textMuted };
    case 'BLOCKED':
      return { label: 'Bloqueado', color: colors.negative };
    default:
      return { label: capability, color: colors.textMuted };
  }
}

function money(value: FiscalMoney | null): string {
  if (!value) return '—';
  return formatCurrency(value.amount, value.currency);
}

export function mapToFiscalMonthlyViewModel(
  data: RawFiscalMonthlyState | null,
): FiscalMonthlyViewModel | null {
  if (!data) return null;

  const isPartial = data.status === 'PARTIAL';
  const isBlocked = data.status === 'BLOCKED';
  const isEmpty = data.status === 'EMPTY';
  const isComplete = data.status === 'COMPLETE';

  let statusLabel = 'Apuração fiscal normalizada.';
  let statusColor: string = colors.positive;
  if (isEmpty) {
    statusLabel = 'Sem eventos fiscais nesta competência.';
    statusColor = colors.textMuted;
  } else if (isPartial) {
    statusLabel = 'Apuração parcial: alguns dados fiscais estão incompletos.';
    statusColor = colors.warning;
  } else if (isBlocked) {
    statusLabel = 'Apuração bloqueada: não há regra fiscal vigente para esta competência.';
    statusColor = colors.negative;
  }

  const [year, month] = data.competence.split('-');
  const competenceLabel = `${month}/${year}`;

  const categories: FiscalCategoryVM[] = data.categories.map((c) => {
    const presentation = capabilityPresentation(c.capability);
    return {
      categoryLabel: fiscalCategoryLabel(c.category),
      currency: c.currency,
      capability: c.capability,
      capabilityLabel: presentation.label,
      capabilityColor: presentation.color,
      eventCount: c.eventCount,
      hasFinancialData: Boolean(
        c.salesProceeds || c.realizedGain || c.realizedLoss || c.income || c.withholding,
      ),
      salesProceedsFormatted: money(c.salesProceeds),
      realizedGainFormatted: money(c.realizedGain),
      realizedLossFormatted: money(c.realizedLoss),
      incomeFormatted: money(c.income),
      qualityLabels: (c.qualityIssues ?? []).map(fiscalQualityIssueLabel),
    };
  });

  const counts = new Map<string, number>();
  for (const event of data.events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }
  const eventsSummary: FiscalEventSummaryVM[] = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([eventType, count]) => ({
      eventType,
      label: fiscalEventTypeLabel(eventType),
      count,
    }));

  const issueLabels = (data.dataQuality.issues ?? []).map(fiscalQualityIssueLabel);

  const ruleSetLabel =
    data.ruleSetVersion === null
      ? 'Sem conjunto de regras vigente'
      : `Conjunto de regras: BR · ${data.ruleSetVersion}`;

  const foundationNotice =
    'Fundação fiscal (Fase 4A). Os valores são fatos fiscais normalizados derivados do ' +
    'livro-razão imutável. Nenhum imposto a pagar, DARF ou declaração de IRPF é calculado nesta fase.';

  const categoriesParts = categories.map(
    (c) => `${c.categoryLabel} (${c.currency}): ${c.capabilityLabel}`,
  );
  const accessibilitySummary =
    `Competência ${competenceLabel}: ${statusLabel} ` +
    `(${data.eventCount} evento(s) fiscal(is)). ` +
    (categoriesParts.length > 0 ? `${categoriesParts.join('; ')}. ` : '') +
    (issueLabels.length > 0 ? `Pendências: ${issueLabels.join('; ')}.` : '');

  return {
    competence: data.competence,
    competenceLabel,
    status: data.status,
    statusLabel,
    statusColor,
    isEmpty,
    isComplete,
    isPartial,
    isBlocked,
    eventCount: data.eventCount,
    currencies: data.currencies,
    categories,
    eventsSummary,
    dataQuality: { hasIssues: issueLabels.length > 0, issueLabels },
    ruleSetVersion: data.ruleSetVersion,
    ruleSetLabel,
    foundationNotice,
    accessibilitySummary,
  };
}

/** Query key including the competence, isolated per tax subject surface. */
export function fiscalMonthlyQueryKey(competence: string): readonly string[] {
  return ['fiscal-monthly', competence] as const;
}
