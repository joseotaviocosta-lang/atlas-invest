/**
 * Phase 5Q-D — allocation scenario presentation (pure, shared).
 *
 * Formatting only: pt-BR money, basis points, neutral deviation language.
 * No floats in parsing, no weights computed here (server is the authority),
 * no advice, no execution vocabulary.
 */

export interface AllocationScenarioRowView {
  category: string;
  targetBp: number;
  currentBp: number | null;
  scenarioAmount: string;
  projectedValue: string;
  projectedBp: number;
  currentDeviationBp: number | null;
  projectedDeviationBp: number;
  state: 'ABOVE_TARGET' | 'BELOW_TARGET' | 'ON_TARGET' | 'UNAVAILABLE';
}

export interface AllocationScenarioResultView {
  currency: string;
  scenarioTotal: string;
  coverage: string | null;
  currentTotal: string;
  projectedTotal: string;
  rows: AllocationScenarioRowView[];
  beforeOutsideCount: number;
  afterOutsideCount: number;
  limitations: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'Fundos Imobiliários (FIIs)',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  FUND: 'Fundos',
  CASH: 'Caixa',
  OTHER: 'Outros',
};

export function scenarioCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** Canonical decimal ('10000.5') -> 'R$ 10.000,50'. Display only, string math. */
export function formatScenarioMoney(canonical: string, currency = 'BRL'): string {
  const trimmed = canonical.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return trimmed;
  const grouped = match[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = ((match[2] ?? '') + '00').slice(0, 2);
  const prefix = currency === 'BRL' ? 'R$ ' : `${currency} `;
  return `${prefix}${grouped},${frac}`;
}

/** Integer basis points -> '25,00%'. Display only. */
export function formatScenarioBp(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return '—';
  const negative = value < 0;
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${frac}%`;
}

/** Signed deviation -> '-5,00 p.p. → -1,80 p.p.'. Neutral, no judgment. */
export function formatScenarioDeviationTransition(before: number | null, after: number): string {
  const format = (value: number | null): string => {
    if (value === null || !Number.isSafeInteger(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const abs = Math.abs(value);
    const intPart = Math.floor(abs / 100).toString();
    const frac = String(abs % 100).padStart(2, '0');
    return `${sign}${intPart},${frac} p.p.`;
  };
  return `${format(before)} → ${format(after)}`;
}

export function describeScenarioState(state: string): string {
  if (state === 'ABOVE_TARGET') return 'Acima da meta';
  if (state === 'BELOW_TARGET') return 'Abaixo da meta';
  if (state === 'ON_TARGET') return 'Na meta';
  return 'Dados indisponíveis';
}

export function describeScenarioLimitation(code: string): string {
  if (code === 'PARTIAL_COVERAGE')
    return 'A simulação considera apenas o valor conhecido da carteira.';
  if (code === 'INSUFFICIENT_DATA')
    return 'Dados insuficientes para simular: cobertura abaixo do mínimo ou carteira sem valor conhecido.';
  if (code === 'NO_STRATEGY')
    return 'Defina metas de alocação antes de simular: sem estratégia, não há comparação.';
  if (code === 'NEEDS_REVIEW')
    return 'Este cenário usa uma categoria que o Atlas não reconhece mais. Revise os valores.';
  if (code === 'CURRENCY_MISMATCH')
    return 'As moedas do plano e da carteira atual divergem. Sem conversão, o impacto não pode ser calculado.';
  return 'Limitação indisponível.';
}

/** Aggregate absolute deviation in bp -> '5,20 p.p.'. Neutral magnitude, no sign, no judgment. */
export function formatAggregatePp(basisPoints: number): string {
  if (!Number.isSafeInteger(basisPoints)) return '—';
  const abs = Math.abs(basisPoints);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped},${frac} p.p.`;
}

/**
 * Parses a pt-BR/neutral money input to integer cents exactly (no floats).
 * Accepts '10000', '10.000', '10.000,50', '10000,50'. Null when invalid.
 * Display/edge parsing only — validation still happens server-side.
 */
export function parseScenarioMoneyToCents(raw: string): bigint | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (cleaned === '' || /^(-|\+)/.test(cleaned)) return null;
  if (!/^[\d.,]+$/.test(cleaned)) return null;
  let canonical: string;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastDot > lastComma) return null;
    canonical = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    canonical = cleaned.replace(',', '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) canonical = cleaned.replace(/\./g, '');
    else canonical = cleaned;
  } else {
    canonical = cleaned;
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(canonical);
  if (!match) return null;
  try {
    return BigInt(match[1]!) * BigInt(100) + BigInt(((match[2] ?? '') + '00').slice(0, 2));
  } catch {
    return null;
  }
}

/** Integer cents -> 'R$ 10.000,50'. Display only. */
export function formatCentsBr(cents: bigint): string {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const intPart = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (abs % BigInt(100)).toString().padStart(2, '0');
  return `R$ ${negative ? '-' : ''}${intPart},${frac}`;
}

/** Plan status -> pt-BR label. Text-labeled, never color-only. */
export function describePlanStatus(status: string): string {
  if (status === 'COMPLETED') return 'Realizado';
  if (status === 'CANCELLED') return 'Cancelado';
  return 'Planejado';
}

/**
 * Factual match reason -> pt-BR label. Rendered verbatim as "why this
 * appeared". No likelihood language anywhere in this vocabulary.
 */
export function describeMatchReason(reason: string): string {
  switch (reason) {
    case 'SAME_CURRENCY':
      return 'Mesma moeda do plano';
    case 'WITHIN_DATE_WINDOW':
      return 'Dentro da janela de busca';
    case 'ON_PLANNED_DATE':
      return 'Na data planejada';
    case 'BEFORE_PLANNED_DATE':
      return 'Antes da data planejada';
    case 'AFTER_PLANNED_DATE':
      return 'Depois da data planejada';
    case 'EXACT_AMOUNT':
      return 'Valor exato';
    case 'PARTIAL_AMOUNT':
      return 'Valor parcial';
    case 'ABOVE_PLANNED_AMOUNT':
      return 'Acima do valor planejado';
    case 'COMBINED_EXACT_AMOUNT':
      return 'Soma exata do par';
    case 'COMBINED_PARTIAL_AMOUNT':
      return 'Soma parcial do par';
    case 'COMBINED_ABOVE_AMOUNT':
      return 'Soma acima do plano';
    default:
      return reason;
  }
}

/** Days between trade and planned date -> neutral pt-BR timing phrase. */
export function describeMatchTiming(
  dateDistanceDays: number,
  tradeDate: string,
  plannedDate: string,
): string {
  if (!Number.isSafeInteger(dateDistanceDays) || tradeDate === plannedDate) {
    return 'na data planejada';
  }
  const days = Math.abs(dateDistanceDays);
  const unit = days === 1 ? 'dia' : 'dias';
  return tradeDate < plannedDate
    ? `${days} ${unit} antes da data planejada`
    : `${days} ${unit} depois da data planejada`;
}

/** Date-only 'YYYY-MM-DD' -> 'DD/MM/YYYY' via string split (no Date). */
export function formatPlanDate(yyyyMmDd: string): string {
  const [year = '', month = '', day = ''] = yyyyMmDd.split('-');
  if (year === '' || month === '' || day === '') return yyyyMmDd;
  return `${day}/${month}/${year}`;
}

/** Month bucket 'YYYY-MM' -> short pt-BR label ('2026-11' -> 'nov/26'). Display only. */
export function formatPlanMonth(monthKey: string): string {
  const [year = '', month = ''] = monthKey.split('-');
  const names = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  const index = Number(month) - 1;
  if (year === '' || Number.isNaN(index) || index < 0 || index > 11) return monthKey;
  return `${names[index]}/${year.slice(2)}`;
}

/** Month bucket 'YYYY-MM' -> long pt-BR label ('2026-11' -> 'Novembro de 2026'). Display only. */
export function formatPlanMonthLong(monthKey: string): string {
  const [year = '', month = ''] = monthKey.split('-');
  const names = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  const index = Number(month) - 1;
  if (year === '' || Number.isNaN(index) || index < 0 || index > 11) return monthKey;
  return `${names[index]} de ${year}`;
}

/** Composition-specific limitations (read-only analytics; no judgment). */
export function describeCompositionLimitation(code: string): string {
  if (code === 'NO_ACTIVITY') return 'A carteira ainda não possui posições avaliadas.';
  if (code === 'PARTIAL_PORTFOLIO_VALUATION')
    return 'Parte da carteira não pôde ser avaliada. A composição considera apenas o valor conhecido.';
  if (code === 'MIXED_CURRENCIES_WITHOUT_TRANSLATION')
    return 'Há mais de uma moeda sem conversão disponível. Os valores são mostrados por moeda, sem conversão.';
  if (code === 'ISSUER_CLASSIFICATION_NOT_AVAILABLE')
    return 'Classificação de emissor indisponível. Nenhuma fonte canônica de emissores foi encontrada.';
  if (code === 'SECTOR_CLASSIFICATION_NOT_AVAILABLE')
    return 'Classificação setorial indisponível. Nenhuma taxonomia setorial canônica foi encontrada.';
  return code;
}

/** Income-specific limitations (read-only analytics; no judgment). */
export function describeIncomeLimitation(code: string): string {
  if (code === 'NO_INCOME_IN_PERIOD') return 'Nenhum rendimento registrado no período selecionado.';
  if (code === 'NO_POSITION_IN_PERIOD')
    return 'A posição não existia neste período. Nenhum rendimento foi atribuído a ela.';
  if (code === 'MULTI_CURRENCY_INCOME')
    return 'Há rendimentos em mais de uma moeda. Os valores são mostrados por moeda, sem conversão.';
  return code;
}

/** Data quality issue titles (read-only diagnostics; no judgment, no scores). */
export function describeDataQualityIssue(code: string): string {
  if (code === 'MISSING_PRICE') return 'Preço indisponível';
  if (code === 'STALE_PRICE') return 'Preço desatualizado';
  if (code === 'INCOMPLETE_COST_BASIS') return 'Custo-base incompleto';
  if (code === 'NO_FX_TRANSLATION') return 'Sem conversão para a moeda do relatório';
  if (code === 'MIXED_CURRENCIES_WITHOUT_TRANSLATION') return 'Múltiplas moedas sem conversão';
  if (code === 'RECONCILIATION_DIVERGENT') return 'Divergência com a origem';
  if (code === 'RECONCILIATION_MISSING_LOCAL') return 'Faltando na carteira';
  if (code === 'RECONCILIATION_MISSING_SOURCE') return 'Faltando na origem';
  if (code === 'RECONCILIATION_UNRESOLVED') return 'Reconciliação não resolvida';
  if (code === 'PENDING_INTEGRATION_REVIEW') return 'Revisão de importação pendente';
  return code;
}

/** Data quality issue detail (factual impact + safe next step; never advice). */
export function describeDataQualityIssueDetail(code: string): string {
  if (code === 'MISSING_PRICE')
    return 'Sem cotação, o valor atual, o peso e o resultado não podem ser calculados. Ver a posição para conferir os dados de mercado.';
  if (code === 'STALE_PRICE')
    return 'A avaliação usa uma cotação anterior. Os valores estão calculados, mas podem estar desatualizados.';
  if (code === 'INCOMPLETE_COST_BASIS')
    return 'O custo desta posição é desconhecido. Custo médio e resultados realizado, não realizado e econômico aparecem como indisponíveis, nunca zerados. Ver as operações para investigar.';
  if (code === 'NO_FX_TRANSLATION')
    return 'Não há conversão para a moeda do relatório. Os valores aparecem na moeda da posição, sem conversão; os valores nativos continuam válidos.';
  if (code === 'MIXED_CURRENCIES_WITHOUT_TRANSLATION')
    return 'Há mais de uma moeda sem conversão disponível. A composição é mostrada por moeda, sem conversão para um total único.';
  if (code === 'RECONCILIATION_DIVERGENT')
    return 'A quantidade na carteira difere da origem importada. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_MISSING_LOCAL')
    return 'Há registros na origem que não estão na carteira. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_MISSING_SOURCE')
    return 'Há posições na carteira sem correspondência na origem. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_UNRESOLVED')
    return 'Há registros que não puderam ser conciliados. Ver as revisões para conferir.';
  if (code === 'PENDING_INTEGRATION_REVIEW')
    return 'Há execuções de importação aguardando revisão. Ver as revisões para conferir.';
  return code;
}

/** Affected capability codes -> neutral pt-BR labels. Display only. */
export function describeAffectedCapability(code: string): string {
  if (code === 'VALUATION') return 'Avaliação';
  if (code === 'ALLOCATION') return 'Alocação';
  if (code === 'UNREALIZED_PNL') return 'Resultado não realizado';
  if (code === 'REALIZED_PNL') return 'Resultado realizado';
  if (code === 'ECONOMIC_PNL') return 'Resultado econômico';
  if (code === 'PERFORMANCE') return 'Desempenho';
  if (code === 'COMPOSITION') return 'Composição';
  if (code === 'REPORTING_VALUE') return 'Valor na moeda do relatório';
  if (code === 'PORTFOLIO_WEIGHT') return 'Peso na carteira';
  if (code === 'RECONCILIATION') return 'Reconciliação';
  return code;
}

/** Quality domain codes -> neutral pt-BR labels. Display only. */
export function describeDataQualityDomain(domain: string): string {
  if (domain === 'MARKET_DATA') return 'Dados de mercado';
  if (domain === 'COST_BASIS') return 'Custo e operações';
  if (domain === 'FX') return 'Moedas';
  if (domain === 'RECONCILIATION') return 'Reconciliação';
  return domain;
}

/** Quality status codes -> neutral pt-BR labels (always text, never color-only). */
export function describeDataQualityStatus(status: string): string {
  if (status === 'COMPLETE') return 'Sem pendências';
  if (status === 'LIMITED') return 'Informações limitadas';
  if (status === 'REVIEW_REQUIRED') return 'Revisar';
  if (status === 'BLOCKED') return 'Dados insuficientes';
  return status;
}

/** Operations status -> neutral pt-BR label. Operational state only, never investment quality. */
export function describeOperationsStatus(status: string): string {
  if (status === 'CLEAR') return 'Sem pendências operacionais';
  if (status === 'ATTENTION_REQUIRED') return 'Revisar';
  if (status === 'BLOCKED') return 'Dados insuficientes';
  return status;
}

/** Operations attention codes -> neutral pt-BR labels. Display only. */
export function describeOperationsAttention(code: string): string {
  if (code === 'SYNC_FAILED') return 'Sincronização falhou';
  if (code === 'SYNC_PARTIAL') return 'Sincronização parcial';
  if (code === 'CONNECTION_NEEDS_REAUTH') return 'Conexão precisa de nova autorização';
  if (code === 'PENDING_REVIEWS') return 'Revisões pendentes';
  if (code === 'RECONCILIATION_DIVERGENT') return 'Divergências com a origem';
  if (code === 'RECONCILIATION_MISSING_LOCAL') return 'Faltando na carteira';
  if (code === 'RECONCILIATION_MISSING_SOURCE') return 'Faltando na origem';
  if (code === 'RECONCILIATION_UNRESOLVED') return 'Reconciliação não resolvida';
  return describeDataQualityIssue(code);
}

/** Operations attention detail -> factual impact + safe next step. */
export function describeOperationsAttentionDetail(code: string): string {
  if (code === 'SYNC_FAILED')
    return 'A última sincronização falhou. Ver o histórico de execuções para conferir.';
  if (code === 'SYNC_PARTIAL')
    return 'A última sincronização foi parcial. Ver o histórico de execuções para conferir.';
  if (code === 'CONNECTION_NEEDS_REAUTH')
    return 'A conexão precisa de nova autorização. Ver as integrações para reconectar.';
  if (code === 'PENDING_REVIEWS')
    return 'Há execuções aguardando revisão. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_DIVERGENT')
    return 'Há divergências entre a carteira e a origem. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_MISSING_LOCAL')
    return 'Há registros na origem que não estão na carteira. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_MISSING_SOURCE')
    return 'Há posições na carteira sem correspondência na origem. Ver as revisões para conferir.';
  if (code === 'RECONCILIATION_UNRESOLVED')
    return 'Há registros que não puderam ser conciliados. Ver as revisões para conferir.';
  return describeDataQualityIssueDetail(code);
}

/** Operations domain codes -> neutral pt-BR labels. Display only. */
export function describeOperationsDomain(domain: string): string {
  if (domain === 'SYNC') return 'Sincronização';
  if (domain === 'INTEGRATION') return 'Integrações';
  if (domain === 'RECONCILIATION') return 'Reconciliação';
  if (domain === 'DATA_QUALITY') return 'Qualidade dos dados';
  return domain;
}

/** Insights-specific limitations (read-only analytics; no judgment). */
export function describeInsightsLimitation(code: string): string {
  if (code === 'NO_PLANS_IN_PERIOD') return 'Nenhum plano no período selecionado.';
  if (code === 'NO_CONFIRMED_ACTUALS')
    return 'Nenhuma operação confirmada no período — os totais consideram apenas intenções declaradas.';
  if (code === 'MIXED_CURRENCIES')
    return 'Há planos em mais de uma moeda; os totais são mostrados por moeda, sem conversão.';
  if (code === 'UNCLASSIFIED_ACTUALS')
    return 'Parte do valor confirmado não pôde ser classificada por categoria e aparece como não classificada.';
  if (code === 'CASH_ACTUAL_SEMANTICS')
    return 'Operações confirmadas representam entradas de caixa. Elas não provam em qual categoria o valor foi aplicado depois.';
  if (code === 'GOAL_CURRENCY_MISMATCH')
    return 'A meta usa outra moeda e não entra neste total; os valores são mostrados por moeda, sem conversão.';
  if (code === 'NO_ACTIVITY') return 'Nenhuma meta, plano ou operação confirmada neste período.';
  return describeScenarioLimitation(code);
}
