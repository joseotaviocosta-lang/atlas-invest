import { formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';

export type PerformancePeriodPreset = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'INCEPTION' | 'CUSTOM';

export interface PerformancePeriodOption {
  value: PerformancePeriodPreset;
  label: string;
}

export const PERFORMANCE_PERIOD_OPTIONS: PerformancePeriodOption[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1A' },
  { value: 'INCEPTION', label: 'Desde o início' },
  { value: 'CUSTOM', label: 'Personalizado' },
];

export function getTodayLocalDateString(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

export function isValidLocalDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function formatLocalDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export interface PortfolioPerformanceBenchmarkVM {
  id: string;
  name: string;
  currency: string;
  type: string;
  return: string | null;
  status: string;
  dataAvailability: string;
  observationCount?: number;
}

export interface PortfolioPerformanceCurrencyVM {
  currency: string;
  twrFormatted: string;
  xirrFormatted: string;
  twrStatus: string;
  xirrStatus: string;
  status: string;
  dataAvailability: string;
  isPositiveTwr: boolean | null;
  isPositiveXirr: boolean | null;
  benchmark?: PortfolioPerformanceBenchmarkVM | null;
  differencePercentagePoints?: string | null;
}

export interface PortfolioPerformanceViewModel {
  period: { startDate: string; endDate: string; display: string };
  currencies: PortfolioPerformanceCurrencyVM[];
  status: string;
  dataAvailability: string;
  isAvailable: boolean;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  periodLabel: string;
}

export interface RawPerformanceData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  currencies: Record<
    string,
    {
      currency: string;
      twr: string | null;
      xirr: string | null;
      twrStatus: string;
      xirrStatus: string;
      status: string;
      dataAvailability: string;
      benchmark?: {
        id: string;
        name: string;
        currency: string;
        type?: string;
        return: string | null;
        status: string;
        dataAvailability: string;
        observationCount?: number;
      } | null;
      differencePercentagePoints?: string | null;
    }
  >;
  status: string;
  dataAvailability: string;
}

export function mapToPortfolioPerformanceViewModel(
  data: RawPerformanceData | null,
): PortfolioPerformanceViewModel | null {
  if (!data) return null;

  const currencies: PortfolioPerformanceCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const twrFormatted = c.twr ? formatPercentage(c.twr) : '—';
    const xirrFormatted = c.xirr ? formatPercentage(c.xirr) : '—';
    const isPositiveTwr = c.twr
      ? c.twr.startsWith('-')
        ? false
        : c.twr !== '0' && c.twr !== '0.00'
      : null;
    const isPositiveXirr = c.xirr
      ? c.xirr.startsWith('-')
        ? false
        : c.xirr !== '0' && c.xirr !== '0.00'
      : null;
    return {
      currency: c.currency,
      twrFormatted,
      xirrFormatted,
      twrStatus: c.twrStatus,
      xirrStatus: c.xirrStatus,
      status: c.status,
      dataAvailability: c.dataAvailability,
      isPositiveTwr,
      isPositiveXirr,
      benchmark: c.benchmark
        ? {
            id: c.benchmark.id,
            name: c.benchmark.name,
            currency: c.benchmark.currency,
            type: c.benchmark.type ?? '',
            return: c.benchmark.return,
            status: c.benchmark.status,
            dataAvailability: c.benchmark.dataAvailability,
            observationCount: c.benchmark.observationCount,
          }
        : (c.benchmark ?? null),
      differencePercentagePoints: c.differencePercentagePoints ?? null,
    };
  });

  const isAvailable = data.dataAvailability === 'AVAILABLE' || data.status === 'COMPLETE';
  const isPartial = data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL';
  const isUnavailable =
    data.dataAvailability === 'UNAVAILABLE' || data.status === 'INSUFFICIENT_DATA';

  let statusLabel = 'Dados completos';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Dados parciais';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Dados indisponíveis';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const periodLabel = `Período: ${periodDisplay}`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
    currencies,
    status: data.status,
    dataAvailability: data.dataAvailability,
    isAvailable,
    isPartial,
    isUnavailable,
    statusLabel,
    statusColor,
    periodLabel,
  };
}

export function getPeriodDates(
  preset: PerformancePeriodPreset,
  todayStr: string,
  customStart?: string,
  customEnd?: string,
  inceptionDate?: string | null,
): { startDate: string; endDate: string } | null {
  if (preset === 'CUSTOM') {
    if (!customStart || !customEnd) return null;
    if (!isValidLocalDateString(customStart) || !isValidLocalDateString(customEnd)) return null;
    if (customStart > customEnd) return null;
    if (customEnd > todayStr) return null;
    return { startDate: customStart, endDate: customEnd };
  }

  if (preset === 'INCEPTION') {
    if (!inceptionDate || !isValidLocalDateString(inceptionDate)) return null;
    if (inceptionDate > todayStr) return null;
    return { startDate: inceptionDate, endDate: todayStr };
  }

  const today = new Date(`${todayStr}T00:00:00Z`);
  let start: Date;

  switch (preset) {
    case '1M':
      start = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, today.getUTCDate()),
      );
      break;
    case '3M':
      start = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, today.getUTCDate()),
      );
      break;
    case '6M':
      start = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 6, today.getUTCDate()),
      );
      break;
    case 'YTD':
      start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      break;
    case '1Y':
      start = new Date(
        Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()),
      );
      break;
    default:
      return null;
  }

  const pad = (n: number): string => String(n).padStart(2, '0');
  let startStr = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
  if (inceptionDate && isValidLocalDateString(inceptionDate) && startStr < inceptionDate) {
    startStr = inceptionDate;
  }
  if (startStr > todayStr) return null;
  return { startDate: startStr, endDate: todayStr };
}

export function performanceQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
): readonly string[] {
  return ['portfolio-performance', portfolioId, startDate, endDate] as const;
}
