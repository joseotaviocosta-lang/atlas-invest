import { formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Portfolio Performance Series view-model (3H, ADR-126).
 *
 * Presentation only: formats server-computed cumulative return strings,
 * derives tooltip labels, chart-ready point lists and accessibility text.
 * NEVER computes returns, re-bases values, compounds rates, links subperiods
 * or handles deposits and withdrawals — all of that is server-side.
 */

export interface PerformanceSeriesPointVM {
  date: string;
  dateDisplay: string;
  portfolioReturn: string | null;
  portfolioReturnFormatted: string;
  benchmarkReturn: string | null;
  benchmarkReturnFormatted: string;
  status: string;
  isGap: boolean;
  /** X pixel position in a width-W chart; computed by the chart, not here. */
  tooltip: string;
}

export interface PerformanceSeriesCurrencyVM {
  currency: string;
  granularity: string;
  status: string;
  dataAvailability: string;
  benchmarkId: string | null;
  benchmarkName: string | null;
  points: PerformanceSeriesPointVM[];
  /** Points with a real portfolio value (for line path; gaps stay gaps). */
  valuedPoints: PerformanceSeriesPointVM[];
  hasGaps: boolean;
  isPartial: boolean;
  isUnavailable: boolean;
}

export interface PortfolioPerformanceSeriesViewModel {
  period: { startDate: string; endDate: string; display: string };
  requestedGranularity: string;
  currencies: PerformanceSeriesCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawPerformanceSeriesData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  requestedGranularity: string;
  currencies: Record<
    string,
    {
      currency: string;
      granularity: string;
      status: string;
      dataAvailability: string;
      benchmark?: {
        id: string;
        name: string;
        currency: string;
        type: string;
        status: string;
        dataAvailability: string;
      } | null;
      points: Array<{
        date: string;
        portfolioReturn: string | null;
        benchmarkReturn: string | null;
        status: string;
      }>;
    }
  >;
  status: string;
  dataAvailability: string;
}

function formatSeriesValue(value: string | null): string {
  if (value === null) return '—';
  const formatted = formatPercentage(value);
  if (value.startsWith('-')) return formatted;
  if (value === '0' || value === '0.00') return formatted;
  return `+${formatted}`;
}

export function mapToPortfolioPerformanceSeriesViewModel(
  data: RawPerformanceSeriesData | null,
): PortfolioPerformanceSeriesViewModel | null {
  if (!data) return null;

  const currencies: PerformanceSeriesCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const rawPoints = Array.isArray(c.points) ? c.points : [];
    const points: PerformanceSeriesPointVM[] = rawPoints.map((p) => {
      const dateDisplay = formatLocalDateDisplay(p.date);
      const portfolioReturnFormatted = formatSeriesValue(p.portfolioReturn);
      const benchmarkReturnFormatted = formatSeriesValue(p.benchmarkReturn);
      const benchLabel = c.benchmark ? c.benchmark.name : 'Benchmark';
      const tooltip =
        `${dateDisplay} • Carteira: ${portfolioReturnFormatted}` +
        (c.benchmark ? ` • ${benchLabel}: ${benchmarkReturnFormatted}` : '');
      return {
        date: p.date,
        dateDisplay,
        portfolioReturn: p.portfolioReturn,
        portfolioReturnFormatted,
        benchmarkReturn: p.benchmarkReturn,
        benchmarkReturnFormatted,
        status: p.status,
        isGap: p.portfolioReturn === null,
        tooltip,
      };
    });
    const valuedPoints = points.filter((p) => !p.isGap);
    const hasGaps = valuedPoints.length !== points.length;
    const isUnavailable =
      c.dataAvailability === 'UNAVAILABLE' ||
      c.status === 'INSUFFICIENT_DATA' ||
      valuedPoints.length < 2;
    const isPartial =
      !isUnavailable && (c.dataAvailability === 'PARTIAL' || c.status === 'PARTIAL');
    return {
      currency: c.currency,
      granularity: c.granularity,
      status: c.status,
      dataAvailability: c.dataAvailability,
      benchmarkId: c.benchmark ? c.benchmark.id : null,
      benchmarkName: c.benchmark ? c.benchmark.name : null,
      points,
      valuedPoints,
      hasGaps,
      isPartial,
      isUnavailable,
    };
  });

  const isPartial = data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL';
  const isUnavailable =
    data.dataAvailability === 'UNAVAILABLE' || data.status === 'INSUFFICIENT_DATA';

  let statusLabel = 'Série completa';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Série parcial';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Série indisponível';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    const last = c.valuedPoints[c.valuedPoints.length - 1];
    const lastStr = last ? last.portfolioReturnFormatted : '—';
    const benchStr =
      c.benchmarkId && last && last.benchmarkReturn !== null
        ? `, ${c.benchmarkName} ${last.benchmarkReturnFormatted}`
        : '';
    return `${c.currency}: carteira ${lastStr}${benchStr}`;
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Evolução da performance da carteira no período ${periodDisplay}. ${parts.join('; ')}. Retorno acumulado normalizado para 0% no início do período.`
      : `Histórico insuficiente para montar o gráfico no período ${periodDisplay}.`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
    requestedGranularity: data.requestedGranularity,
    currencies,
    status: data.status,
    dataAvailability: data.dataAvailability,
    isPartial,
    isUnavailable,
    statusLabel,
    statusColor,
    accessibilitySummary,
  };
}

export function performanceSeriesQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
  benchmark: string,
  granularity: string,
): readonly string[] {
  return [
    'portfolio-performance-series',
    portfolioId,
    startDate,
    endDate,
    benchmark || 'none',
    granularity || 'AUTO',
  ] as const;
}
