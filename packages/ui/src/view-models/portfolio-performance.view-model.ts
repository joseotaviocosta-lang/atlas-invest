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

  const isUnavailable =
    data.dataAvailability === 'UNAVAILABLE' || data.status === 'INSUFFICIENT_DATA';
  const isPartial =
    !isUnavailable && (data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL');
  const isAvailable =
    !isUnavailable &&
    !isPartial &&
    (data.dataAvailability === 'AVAILABLE' || data.status === 'COMPLETE');

  let statusLabel = 'Dados completos';
  let statusColor: string = colors.positive;
  if (isUnavailable) {
    statusLabel = 'Dados indisponíveis';
    statusColor = colors.textMuted;
  } else if (isPartial) {
    statusLabel = 'Dados parciais';
    statusColor = colors.warning;
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

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonthCivil(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

function subtractMonthsCivil(year: number, month: number, day: number, monthsToSubtract: number): string {
  let targetMonth = month - monthsToSubtract;
  let targetYear = year;

  while (targetMonth < 1) {
    targetMonth += 12;
    targetYear -= 1;
  }

  const maxDay = getDaysInMonthCivil(targetYear, targetMonth);
  const targetDay = Math.min(day, maxDay);

  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;
}

function subtractYearsCivil(year: number, month: number, day: number, yearsToSubtract: number): string {
  const targetYear = year - yearsToSubtract;
  const maxDay = getDaysInMonthCivil(targetYear, month);
  const targetDay = Math.min(day, maxDay);

  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${targetYear}-${pad(month)}-${pad(targetDay)}`;
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

  if (!isValidLocalDateString(todayStr)) return null;
  const [yStr, mStr, dStr] = todayStr.split('-');
  const year = parseInt(yStr!, 10);
  const month = parseInt(mStr!, 10);
  const day = parseInt(dStr!, 10);

  let startStr: string;

  switch (preset) {
    case '1M':
      startStr = subtractMonthsCivil(year, month, day, 1);
      break;
    case '3M':
      startStr = subtractMonthsCivil(year, month, day, 3);
      break;
    case '6M':
      startStr = subtractMonthsCivil(year, month, day, 6);
      break;
    case 'YTD':
      startStr = `${year}-01-01`;
      break;
    case '1Y':
      startStr = subtractYearsCivil(year, month, day, 1);
      break;
    default:
      return null;
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
