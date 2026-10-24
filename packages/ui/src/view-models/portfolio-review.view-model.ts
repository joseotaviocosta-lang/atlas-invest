/**
 * Phase 5Q-A — portfolio review presentation (pure, shared).
 *
 * Human pt-BR copy for derived review signals. Titles and summaries are
 * built from server evidence (raw strings/numbers); no floats, no
 * financial math, no advice. Severity is always text-labeled, never
 * color-only. Facts stay facts; actions are navigation only.
 */

export type ReviewSignalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ReviewSignalPresentation {
  label: string;
  tone: ReviewSignalTone;
  description: string;
}

const SIGNAL_COPY: Record<string, ReviewSignalPresentation> = {
  DATA_VALUATION_COVERAGE: {
    label: 'Cobertura de preços parcial',
    tone: 'info',
    description: 'Nem todas as posições têm cotação disponível.',
  },
  DATA_RECONCILIATION_DIVERGENCE: {
    label: 'Divergências entre carteira e fonte',
    tone: 'warning',
    description: 'Há diferenças entre o livro-razão e os dados da fonte.',
  },
  INTEGRATION_PENDING_REVIEW: {
    label: 'Importações aguardam revisão',
    tone: 'warning',
    description: 'Há itens aguardando sua revisão antes de importar.',
  },
  ALLOCATION_SINGLE_ASSET_CONCENTRATION: {
    label: 'Concentração elevada',
    tone: 'warning',
    description: 'Uma parcela relevante do patrimônio depende de um único ativo.',
  },
  STRATEGY_ALLOCATION_DEVIATION: {
    label: 'Fora das metas definidas',
    tone: 'warning',
    description: 'A alocação atual difere das metas que você definiu.',
  },
  PERFORMANCE_BENCHMARK_GAP: {
    label: 'Abaixo do benchmark no período',
    tone: 'warning',
    description: 'A carteira ficou abaixo do benchmark no período analisado.',
  },
  PERFORMANCE_BENCHMARK_UNAVAILABLE: {
    label: 'Benchmark indisponível',
    tone: 'info',
    description: 'Sem dados de benchmark no período para comparação.',
  },
  INCOME_RECEIVED: {
    label: 'Proventos acumulados',
    tone: 'info',
    description: 'A carteira acumulou proventos no histórico registrado.',
  },
};

/**
 * Phase 5Q-B — "why am I seeing this" explanations (STEP 30).
 * Heuristic documentation only: states the rule, never advises.
 */
const REVIEW_RULE_COPY: Record<string, string> = {
  DATA_VALUATION_COVERAGE:
    'O Atlas mostra este ponto quando menos de 100% das posições têm cotação disponível. Abaixo de 80%, a cobertura é considerada insuficiente para conclusões e o item pede revisão.',
  DATA_RECONCILIATION_DIVERGENCE:
    'O Atlas compara o livro-razão com os dados da fonte a cada sincronização. Qualquer posição divergente, ausente de um dos lados ou sem resolução aparece aqui.',
  INTEGRATION_PENDING_REVIEW:
    'Importações e sincronizações aguardando sua confirmação aparecem aqui. Nada é importado sem a sua revisão.',
  ALLOCATION_SINGLE_ASSET_CONCENTRATION:
    'O Atlas destaca posições individuais a partir de 25% do valor conhecido da carteira. Abaixo disso, a posição aparece apenas na alocação.',
  STRATEGY_ALLOCATION_DEVIATION:
    'Você definiu metas de alocação por classe de ativo. Este item aparece quando uma ou mais categorias estão fora da tolerância de 1 ponto percentual em relação à sua meta.',
  PERFORMANCE_BENCHMARK_GAP:
    'O Atlas compara a rentabilidade da carteira com o benchmark no período. Diferenças a partir de 2 pontos percentuais abaixo aparecem aqui.',
  PERFORMANCE_BENCHMARK_UNAVAILABLE:
    'Sem dados do benchmark no período não há como comparar. Este item apenas registra a ausência.',
  INCOME_RECEIVED:
    'O Atlas soma proventos registrados no livro-razão (dividendos, JCP e rendimentos de FII). Não há projeção de proventos futuros.',
};

export function describeReviewRule(code: string): string {
  return (
    REVIEW_RULE_COPY[code] ??
    'Este ponto é derivado dos dados atuais da carteira com regras determinísticas.'
  );
}

const REVIEW_LIMITATION_COPY: Record<string, string> = {
  NO_HISTORICAL_SOURCE:
    'Histórico indisponível para este indicador. A análise considera o snapshot atual.',
  NO_BENCHMARK_IN_PERIOD: 'Sem dados do benchmark no período para comparação.',
  WINDOW_TRUNCATED: 'O histórico mostra as execuções mais recentes dentro do limite da janela.',
  MULTI_CURRENCY_NO_TRANSLATION:
    'Sem conversão para moeda única, a análise por ativo fica restrita a cada moeda.',
  NO_INCOME_IN_PERIOD: 'Sem proventos registrados no período.',
  SINGLE_SNAPSHOT_ONLY: 'Apenas o snapshot atual está disponível para este indicador.',
};

export function describeReviewLimitation(code: string): string {
  return REVIEW_LIMITATION_COPY[code] ?? 'Informação adicional indisponível.';
}

export type ReviewTrendTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ReviewTrendPresentation {
  label: string;
  tone: ReviewTrendTone;
}

/**
 * Neutral direction vocabulary (STEP 21): movement only, never judgment.
 * No "improved/worsened/good/bad" — except coverage direction, which is
 * itself the data-quality statement.
 */
export function describeReviewTrend(trend: string): ReviewTrendPresentation {
  switch (trend) {
    case 'INCREASED':
      return { label: 'Em alta', tone: 'info' };
    case 'DECREASED':
      return { label: 'Em queda', tone: 'info' };
    case 'STABLE':
      return { label: 'Estável', tone: 'neutral' };
    default:
      return { label: 'Sem dados suficientes', tone: 'neutral' };
  }
}

export function describeReviewSignal(code: string): ReviewSignalPresentation {
  return (
    SIGNAL_COPY[code] ?? {
      label: 'Ponto de atenção',
      tone: 'neutral' as const,
      description: 'Um ponto da carteira merece revisão.',
    }
  );
}

export interface ReviewSignalInput {
  code: string;
  severity: string;
  evidence: Record<string, string | number | boolean | null>;
}

export interface ReviewSignalLine {
  text: string;
  tone: ReviewSignalTone;
}

/**
 * One-line title for a review card. Numbers come straight from evidence
 * (server strings); formatting only, never new math. Never advice.
 */
export function buildReviewSignalTitle(signal: ReviewSignalInput): string {
  const evidence = signal.evidence;
  switch (signal.code) {
    case 'DATA_VALUATION_COVERAGE': {
      const valued = toCount(evidence.valuedPositions);
      const total = toCount(evidence.totalPositions);
      const coverage =
        typeof evidence.coveragePercent === 'string' ? evidence.coveragePercent : null;
      if (valued !== null && total !== null && coverage !== null) {
        return `${valued} de ${total} posições com cotação atualizada (${formatPercentString(coverage)} da carteira)`;
      }
      return 'Parte das posições está sem cotação atualizada';
    }
    case 'DATA_RECONCILIATION_DIVERGENCE': {
      const total =
        toCount(evidence.divergent) +
        toCount(evidence.missingLocal) +
        toCount(evidence.missingSource) +
        toCount(evidence.unresolved);
      return total > 0
        ? `${total} ${total === 1 ? 'divergência precisa' : 'divergências precisam'} de revisão`
        : 'Há divergências entre carteira e fonte';
    }
    case 'INTEGRATION_PENDING_REVIEW': {
      const count = toCount(evidence.pendingReviewCount);
      if (count === 1) return '1 importação aguarda revisão';
      return `${count} importações aguardam revisão`;
    }
    case 'ALLOCATION_SINGLE_ASSET_CONCENTRATION': {
      const ticker = typeof evidence.ticker === 'string' ? evidence.ticker : 'Um ativo';
      const weight = typeof evidence.weightPercent === 'string' ? evidence.weightPercent : null;
      if (weight !== null) {
        return `${ticker} representa ${formatPercentString(weight)} do valor conhecido da carteira`;
      }
      return `Concentração elevada em ${ticker}`;
    }
    case 'STRATEGY_ALLOCATION_DEVIATION': {
      const count = toCount(evidence.categoriesOutsideTarget);
      if (count === 1) return '1 categoria fora das metas definidas';
      if (count > 1) return `${count} categorias fora das metas definidas`;
      return 'Alocação fora das metas definidas';
    }
    case 'PERFORMANCE_BENCHMARK_GAP': {
      const benchmark =
        typeof evidence.worstBenchmark === 'string' ? evidence.worstBenchmark : 'o benchmark';
      const gap =
        typeof evidence.worstGapPercentagePoints === 'string'
          ? evidence.worstGapPercentagePoints
          : null;
      if (gap !== null) {
        return `${formatPointsString(gap)} abaixo de ${benchmark} no período`;
      }
      return `Abaixo de ${benchmark} no período`;
    }
    case 'PERFORMANCE_BENCHMARK_UNAVAILABLE': {
      const benchmarks = typeof evidence.benchmarks === 'string' ? evidence.benchmarks : null;
      return benchmarks
        ? `Sem dados de ${benchmarks} no período para comparação`
        : 'Sem dados de benchmark no período para comparação';
    }
    case 'INCOME_RECEIVED': {
      const breakdown = typeof evidence.breakdown === 'string' ? evidence.breakdown : null;
      return breakdown ?? 'A carteira acumulou proventos';
    }
    default:
      return 'Um ponto da carteira merece revisão';
  }
}

/**
 * Supporting evidence lines for a card. Counts and codes only; safe,
 * non-technical language.
 */
export function buildReviewSignalLines(signal: ReviewSignalInput): ReviewSignalLine[] {
  const evidence = signal.evidence;
  const lines: ReviewSignalLine[] = [];
  switch (signal.code) {
    case 'DATA_VALUATION_COVERAGE': {
      const stale = toCount(evidence.stalePositions);
      if (stale > 0) {
        lines.push({
          text: `${stale} ${stale === 1 ? 'posição desatualizada' : 'posições desatualizadas'}`,
          tone: 'warning',
        });
      }
      lines.push({
        text: 'Análises abaixo consideram apenas o valor com preço disponível.',
        tone: 'info',
      });
      return lines;
    }
    case 'DATA_RECONCILIATION_DIVERGENCE': {
      pushCountLine(lines, toCount(evidence.divergent), 'com quantidade diferente', 'warning');
      pushCountLine(
        lines,
        toCount(evidence.missingLocal),
        'na carteira e fora da fonte',
        'warning',
      );
      pushCountLine(
        lines,
        toCount(evidence.missingSource),
        'na fonte e fora da carteira',
        'warning',
      );
      pushCountLine(lines, toCount(evidence.unresolved), 'sem resolução', 'warning');
      return lines;
    }
    case 'ALLOCATION_SINGLE_ASSET_CONCENTRATION': {
      const threshold =
        typeof evidence.thresholdPercent === 'string' ? evidence.thresholdPercent : null;
      if (threshold !== null) {
        lines.push({
          text: `Limite de atenção: ${formatPercentString(threshold)} por ativo.`,
          tone: 'info',
        });
      }
      const coverage =
        typeof evidence.coveragePercent === 'string' ? evidence.coveragePercent : null;
      if (coverage !== null && coverage !== '100') {
        lines.push({
          text: `Cálculo sobre ${formatPercentString(coverage)} com preço disponível.`,
          tone: 'info',
        });
      }
      const extra = toCount(evidence.concentratedPositions);
      if (extra > 1) {
        lines.push({
          text: `${extra} ativos acima do limite de atenção. Mostrando o maior.`,
          tone: 'info',
        });
      }
      return lines;
    }
    case 'STRATEGY_ALLOCATION_DEVIATION': {
      const worstCategory =
        typeof evidence.worstCategory === 'string' ? evidence.worstCategory : null;
      const worst =
        typeof evidence.worstDeviationBp === 'number' ? evidence.worstDeviationBp : null;
      if (worstCategory !== null && worst !== null) {
        lines.push({
          text: `Maior desvio: ${formatDeviationBp(worst)} em ${worstCategory}.`,
          tone: 'info',
        });
      }
      const coverage =
        typeof evidence.coveragePercent === 'string' ? evidence.coveragePercent : null;
      if (coverage !== null && coverage !== '100') {
        lines.push({
          text: `Cálculo sobre ${formatPercentString(coverage)} com preço disponível.`,
          tone: 'info',
        });
      }
      return lines;
    }
    case 'PERFORMANCE_BENCHMARK_GAP': {
      const periodStart = typeof evidence.periodStart === 'string' ? evidence.periodStart : null;
      const periodEnd = typeof evidence.periodEnd === 'string' ? evidence.periodEnd : null;
      if (periodStart !== null && periodEnd !== null) {
        lines.push({
          text: `Período: ${formatCivilDate(periodStart)} a ${formatCivilDate(periodEnd)}.`,
          tone: 'info',
        });
      }
      return lines;
    }
    default:
      return lines;
  }
}

function toCount(value: string | number | boolean | null | undefined): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}

function pushCountLine(
  lines: ReviewSignalLine[],
  count: number,
  label: string,
  tone: ReviewSignalTone,
): void {
  if (count > 0) {
    lines.push({ text: `${count} ${label}`, tone });
  }
}

/** '31.42' -> '31,42%'. Display only; never parses to float. */
function formatPercentString(value: string): string {
  const [intPart = '', fracPart = ''] = value.split('.');
  const normalizedFrac = (fracPart + '00').slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped},${normalizedFrac}%`;
}

/** '-4.20' -> '-4,20 p.p.'. Display only. */
function formatPointsString(value: string): string {
  const negative = value.trim().startsWith('-');
  const abs = negative ? value.trim().slice(1) : value.trim();
  return `${negative ? '-' : '+'}${formatPercentString(abs).replace('%', '')} p.p.`;
}

/** -420 -> '-4,20 p.p.'. Display only; input is integer basis points. */
function formatDeviationBp(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(value));
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${frac} p.p.`;
}

/** '2026-06-16' -> '16/06/2026'. Display only. */
function formatCivilDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
