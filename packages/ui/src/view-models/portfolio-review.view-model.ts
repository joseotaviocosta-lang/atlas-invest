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

/** '2026-06-16' -> '16/06/2026'. Display only. */
function formatCivilDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
