import { formatCurrency, formatPercentage, formatRatio } from '../formatters';

/**
 * Portfolio AI Explanation View Model (Phase 3R, ADR-179–ADR-185)
 *
 * Safe client presentation for grounded explanation outputs.
 * Strict invariants:
 * - Zero financial calculations (formatting only)
 * - Explicit badges for Historical and Hypothetical data
 * - Displays server-resolved canonical evidence facts
 */

export interface ExplanationEvidenceVM {
  factId: string;
  category: string;
  metric: string;
  scope: string;
  valueRaw: string;
  valueFormatted: string;
  unit: string;
  natureBadge: 'HISTORICO' | 'HIPOTESE' | 'ANALITICO';
  natureBadgeLabel: string;
  status: string;
  label: string;
}

export interface PortfolioAiExplanationVM {
  status: 'ANSWERED' | 'UNSUPPORTED' | 'UNAVAILABLE';
  isAnswered: boolean;
  isUnsupported: boolean;
  isUnavailable: boolean;
  intent: string;
  reason?: string;
  answer: string;
  evidence: ExplanationEvidenceVM[];
  limitations: string[];
  hasEvidence: boolean;
  hasLimitations: boolean;
  claims?: unknown;
  providerInfo?: {
    provider: string;
    model: string;
  };
}

export interface GroundedExplanationDto {
  schemaVersion: string;
  status: 'ANSWERED' | 'UNSUPPORTED' | 'UNAVAILABLE';
  intent: string;
  reason?: string;
  answer: string;
  claims?: unknown;
  evidence: Array<{
    factId: string;
    category: string;
    metric: string;
    scope: string;
    value: string | null;
    unit: string;
    period?: string;
    asOf?: string;
    nature: string;
    status: string;
  }>;
  limitations: string[];
  model?: {
    provider: string;
    model: string;
    requestId?: string;
  };
}

const METRIC_LABELS: Record<string, string> = {
  CURRENT_MARKET_VALUE: 'Patrimônio Atual',
  TOTAL_COST: 'Custo Total',
  TOTAL_PROFIT_LOSS: 'Lucro/Prejuízo Total',
  TWR: 'Retorno Ponderado no Tempo (TWR)',
  XIRR: 'Taxa Interna de Retorno (XIRR)',
  VOLATILITY: 'Volatilidade Anualizada',
  MAX_DRAWDOWN: 'Queda Máxima (Max Drawdown)',
  SHARPE_RATIO: 'Índice de Sharpe',
  SORTINO_RATIO: 'Índice de Sortino',
  VAR_95: 'Value at Risk (VaR 95%)',
  CVAR_95: 'Conditional VaR (CVaR 95%)',
  BETA: 'Beta do Benchmark',
  CORRELATION: 'Correlação com Benchmark',
  TRACKING_ERROR: 'Tracking Error',
  INFORMATION_RATIO: 'Índice de Informação',
  TREYNOR_RATIO: 'Índice de Treynor',
  ALPHA: 'Alfa de Jensen',
  RETURN: 'Retorno do Benchmark',
  DIFFERENCE: 'Diferença vs Benchmark',
  STRESSED_VALUE: 'Valor Estressado (Cenário)',
  ESTIMATED_IMPACT: 'Impacto Estimado (Cenário)',
  // Tax (Phase 5U)
  TAX_DUE: 'Imposto Devido (DARF)',
  GROSS_SALES: 'Vendas Brutas no Mês',
  TAXABLE_RESULT: 'Resultado Tributável',
  REALIZED_LOSS: 'Prejuízo Realizado',
  LOSS_APPLIED: 'Prejuízo Compensado',
  CLOSING_LOSS_BALANCE: 'Prejuízo a Compensar',
  WITHHOLDING_APPLIED: 'IRRF Compensado',
  DARF_STATUS: 'Situação do DARF',
  DARF_DUE_DATE: 'Vencimento do DARF',
  DARF_BAR_CODE: 'Código de Barras',
  EXEMPTION_APPLIED: 'Isenção de R$ 20k',
  COMPLIANCE_STATUS: 'Situação Fiscal',
  COMPETENCE: 'Competência',
  // Operations & Audit (Phase 5U)
  RECTIFICATION_COUNT: 'Operações Retificadas',
  LAST_RECTIFICATION_DATE: 'Data da Última Retificação',
  LAST_RECTIFICATION_REASON: 'Motivo da Retificação',
  RECONCILIATION_PENDING_COUNT: 'Pendências de Reconciliação',
  LAST_RECONCILIATION_DECISION: 'Última Decisão de Reconciliação',
  OPERATIONAL_RECOVERY_STATUS: 'Estado de Recuperação',
  // Contribution (Phase 5U)
  MONTHLY_CONTRIBUTION_GOAL: 'Meta Mensal de Aporte',
  ACTUAL_CONTRIBUTIONS: 'Aportes Realizados',
  CONTRIBUTION_ADHERENCE: 'Aderência à Meta',
  CONTRIBUTION_STATUS: 'Situação do Aporte',
  // Market (Phase 5U)
  QUOTE_PRICE: 'Cotação de Fechamento',
  QUOTE_DATE: 'Data da Cotação',
  QUOTE_FRESHNESS: 'Atualização da Cotação',
  FUNDAMENTALS_AVAILABLE: 'Disponibilidade de Fundamentos',
  NEWS_AVAILABLE: 'Disponibilidade de Notícias',
};

export function mapToPortfolioAiExplanationVM(
  dto: GroundedExplanationDto,
): PortfolioAiExplanationVM {
  const isAnswered = dto.status === 'ANSWERED';
  const isUnsupported = dto.status === 'UNSUPPORTED';
  const isUnavailable = dto.status === 'UNAVAILABLE';

  const evidence: ExplanationEvidenceVM[] = (dto.evidence || []).map((item) => {
    const rawValue = item.value ?? '—';
    let valueFormatted = rawValue;
    if (item.value != null && (item.unit === 'PERCENTAGE' || item.unit === 'PERCENTAGE_POINTS')) {
      valueFormatted = formatPercentage(item.value, { showSign: false });
    } else if (item.value != null && (item.unit === 'MONEY' || item.unit === 'CURRENCY')) {
      valueFormatted = formatCurrency(item.value, { currencyCode: item.scope });
    } else if (item.value != null && item.unit === 'RATIO') {
      valueFormatted = formatRatio(item.value);
    }

    let natureBadge: 'HISTORICO' | 'HIPOTESE' | 'ANALITICO' = 'ANALITICO';
    let natureBadgeLabel = 'Fato';
    if (item.nature === 'HYPOTHETICAL') {
      natureBadge = 'HIPOTESE';
      natureBadgeLabel = 'Hipótese';
    } else if (item.nature === 'HISTORICAL') {
      natureBadge = 'HISTORICO';
      natureBadgeLabel = 'Histórico';
    }

    const label = METRIC_LABELS[item.metric] || item.metric;

    return {
      factId: item.factId,
      category: item.category,
      metric: item.metric,
      scope: item.scope,
      valueRaw: rawValue,
      valueFormatted,
      unit: item.unit,
      natureBadge,
      natureBadgeLabel,
      status: item.status,
      label,
    };
  });

  return {
    status: dto.status,
    isAnswered,
    isUnsupported,
    isUnavailable,
    intent: dto.intent,
    reason: dto.reason,
    answer: dto.answer,
    evidence,
    claims: dto.claims,
    limitations: dto.limitations || [],
    hasEvidence: evidence.length > 0,
    hasLimitations: (dto.limitations || []).length > 0,
    providerInfo: dto.model ? { provider: dto.model.provider, model: dto.model.model } : undefined,
  };
}
