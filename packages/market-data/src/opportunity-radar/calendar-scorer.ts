import {
  FiiDividendCalendarEvent,
  FiiDividendEligibilityStatus,
  FiiReinvestmentChain,
  FiiReinvestmentChainType,
} from './types';

/**
 * Validates whether a value is a strict YYYY-MM-DD date string.
 */
export function isValidIsoDateString(val: unknown): val is string {
  if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return false;
  }
  const [y, m, d] = val.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Normalizes a raw date representation to YYYY-MM-DD or null.
 */
function normalizeDateStr(val: unknown): string | null {
  if (!val || typeof val !== 'string') {
    return null;
  }
  const candidate = val.trim().slice(0, 10);
  return isValidIsoDateString(candidate) ? candidate : null;
}

/**
 * Calculates calendar day difference between two YYYY-MM-DD dates: (dateA - dateB) in days.
 */
export function diffCalendarDays(dateAStr: string, dateBStr: string): number {
  const [yA, mA, dA] = dateAStr.split('-').map(Number);
  const [yB, mB, dB] = dateBStr.split('-').map(Number);
  if (!yA || !mA || !dA || !yB || !mB || !dB) {
    return 0;
  }
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  const msPerDay = 86400000;
  return Math.round((utcA - utcB) / msPerDay);
}

/**
 * Formats a Date object to YYYY-MM-DD string in America/Sao_Paulo (or given) timezone.
 */
export function formatIsoDateString(date: Date = new Date(), timeZone = 'America/Sao_Paulo'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export interface NormalizedDividendEvent {
  recordDate: string | null;   // YYYY-MM-DD (data-com)
  paymentDate: string | null;  // YYYY-MM-DD (data de pagamento)
  exDate: string | null;       // YYYY-MM-DD (data-ex)
  approvedOn: string | null;   // YYYY-MM-DD
  rate: number | null;
  relatedTo: string | null;
}

/**
 * Normalizes a raw dividend event from an external data provider (e.g. BRAPI).
 * Returns null if the event contains no valid recordDate or paymentDate.
 */
export function normalizeDividendEvent(raw: {
  lastDatePrior?: unknown;
  recordDate?: unknown;
  paymentDate?: unknown;
  exDate?: unknown;
  dateEx?: unknown;
  approvedOn?: unknown;
  rate?: unknown;
  relatedTo?: unknown;
} | null | undefined): NormalizedDividendEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const recordDate = normalizeDateStr(raw.lastDatePrior ?? raw.recordDate);
  const paymentDate = normalizeDateStr(raw.paymentDate);
  const exDate = normalizeDateStr(raw.exDate ?? raw.dateEx);
  const approvedOn = normalizeDateStr(raw.approvedOn);

  // An event must have at least recordDate or paymentDate to be meaningful
  if (!recordDate && !paymentDate) {
    return null;
  }

  let rate: number | null = null;
  if (raw.rate !== undefined && raw.rate !== null && raw.rate !== '') {
    const num = Number(raw.rate);
    if (!Number.isNaN(num) && num >= 0) {
      rate = Math.round(num * 10000) / 10000;
    }
  }

  const relatedTo = typeof raw.relatedTo === 'string' ? raw.relatedTo.trim() || null : null;

  return {
    recordDate,
    paymentDate,
    exDate,
    approvedOn,
    rate,
    relatedTo,
  };
}

/**
 * Sorts normalized dividend events deterministically:
 * recordDate ASC, paymentDate ASC, approvedOn ASC, rate DESC.
 */
export function sortDividendEvents(events: NormalizedDividendEvent[]): NormalizedDividendEvent[] {
  return [...events].sort((a, b) => {
    // 1. recordDate ASC (nulls last)
    if (a.recordDate && b.recordDate) {
      const cmp = a.recordDate.localeCompare(b.recordDate);
      if (cmp !== 0) return cmp;
    } else if (a.recordDate && !b.recordDate) {
      return -1;
    } else if (!a.recordDate && b.recordDate) {
      return 1;
    }

    // 2. paymentDate ASC (nulls last)
    if (a.paymentDate && b.paymentDate) {
      const cmp = a.paymentDate.localeCompare(b.paymentDate);
      if (cmp !== 0) return cmp;
    } else if (a.paymentDate && !b.paymentDate) {
      return -1;
    } else if (!a.paymentDate && b.paymentDate) {
      return 1;
    }

    // 3. approvedOn ASC (nulls last)
    if (a.approvedOn && b.approvedOn) {
      const cmp = a.approvedOn.localeCompare(b.approvedOn);
      if (cmp !== 0) return cmp;
    } else if (a.approvedOn && !b.approvedOn) {
      return -1;
    } else if (!a.approvedOn && b.approvedOn) {
      return 1;
    }

    // 4. rate DESC
    return (b.rate ?? 0) - (a.rate ?? 0);
  });
}

/**
 * Selects the most relevant dividend event relative to the reference date:
 * 1. Priority: Event with recordDate >= referenceDateStr (closest upcoming data-com).
 * 2. Secondary priority: Event with paymentDate >= referenceDateStr and recordDate < referenceDateStr (pending payment flow).
 * 3. Otherwise: Returns null (all historical events that have fully passed).
 */
export function selectRelevantDividendEvent(
  events: NormalizedDividendEvent[],
  referenceDateStr: string,
): NormalizedDividendEvent | null {
  if (!events || events.length === 0) {
    return null;
  }

  const sorted = sortDividendEvents(events);

  // 1. Upcoming recordDate (eligible or record-date-today)
  const upcomingRecord = sorted.find(
    (e) => e.recordDate !== null && e.recordDate >= referenceDateStr,
  );
  if (upcomingRecord) {
    return upcomingRecord;
  }

  // 2. Pending payment flow (recordDate passed, but payment still ahead)
  const pendingPayment = sorted.find(
    (e) =>
      e.paymentDate !== null &&
      e.paymentDate >= referenceDateStr &&
      (e.recordDate === null || e.recordDate < referenceDateStr),
  );
  if (pendingPayment) {
    return pendingPayment;
  }

  // 3. All events are historical and concluded
  return null;
}

/**
 * Pure deterministic calculation of dividend eligibility relative to the reference date (APP-16I / APP-16I-R1).
 *
 * Strict Entitlement Rule:
 * - refDate < recordDate: ELIGIBLE (within data-com, buyer is entitled to announced dividend).
 * - refDate === recordDate: RECORD_DATE_TODAY (last day to acquire with dividend rights).
 * - refDate > recordDate: EX_DIVIDEND (entitlement passed; buyer will NOT receive this cycle's dividend).
 */
export function calculateDividendEligibility(
  recordDate: string | null,
  referenceDateStr: string,
  paymentDate?: string | null,
): {
  eligibilityStatus: FiiDividendEligibilityStatus;
  daysUntilRecordDate: number | null;
  isPaymentPending: boolean;
} {
  const isPaymentPending = Boolean(paymentDate && paymentDate >= referenceDateStr);

  if (!recordDate) {
    return {
      eligibilityStatus: 'UNKNOWN',
      daysUntilRecordDate: null,
      isPaymentPending,
    };
  }

  const daysUntil = diffCalendarDays(recordDate, referenceDateStr);

  if (referenceDateStr < recordDate) {
    return {
      eligibilityStatus: 'ELIGIBLE',
      daysUntilRecordDate: daysUntil,
      isPaymentPending: false,
    };
  }

  if (referenceDateStr === recordDate) {
    return {
      eligibilityStatus: 'RECORD_DATE_TODAY',
      daysUntilRecordDate: 0,
      isPaymentPending: false,
    };
  }

  // referenceDateStr > recordDate
  return {
    eligibilityStatus: 'EX_DIVIDEND',
    daysUntilRecordDate: daysUntil,
    isPaymentPending,
  };
}

/**
 * Computes Dividend Calendar Fit score (0..100) or null if UNKNOWN/disabled (APP-16I / APP-16I-R1).
 */
export function calculateDividendCalendarFit(
  event?: FiiDividendCalendarEvent,
  enableStrategy = true,
): number | null {
  if (!enableStrategy || !event) {
    return null;
  }

  if (event.eventStatus === 'UNKNOWN') {
    return null; // UNKNOWN dimension, dynamically excluded from weights
  }

  if (event.eventStatus === 'HISTORICAL_PATTERN') {
    return 55; // Moderate recurring fit
  }

  // eventStatus === 'ANNOUNCED'
  if (event.eligibilityStatus === 'ELIGIBLE') {
    let score = 75;
    const days = event.daysUntilRecordDate ?? 15;
    if (days >= 1 && days <= 5) {
      score = 95; // Optimal actionable window
    } else if (days >= 6 && days <= 12) {
      score = 85; // Strong favorable window
    } else if (days >= 13 && days <= 25) {
      score = 75; // Favorable window
    } else if (days > 25) {
      score = 65; // Far out
    } else {
      score = 80;
    }

    if (event.sameMonthReinvestmentCandidate) {
      score = Math.min(100, score + 5);
    }
    return score;
  }

  if (event.eligibilityStatus === 'RECORD_DATE_TODAY') {
    let score = 80; // Final day urgency
    if (event.sameMonthReinvestmentCandidate) {
      score = Math.min(100, score + 5);
    }
    return score;
  }

  if (event.eligibilityStatus === 'EX_DIVIDEND') {
    // If payment is still pending, distribution is ongoing; buyer misses announced dividend
    return 25;
  }

  return null;
}

export interface ReinvestmentDetectionResult {
  chains: FiiReinvestmentChain[];
  candidateTickers: Set<string>;
  bestChainByTarget: Map<string, FiiReinvestmentChain>;
  targetTickerBySource: Map<string, string>;
}

/**
 * Detects cross-FII dividend reinvestment sequences in the portfolio (APP-16I / APP-16I-R1).
 *
 * Sequence:
 * FII A pays dividend on sourcePaymentDate
 * -> Cash becomes available (AVAILABLE_CASH_CHAIN if sourcePaymentDate <= referenceDate, else PLANNED_FUTURE_CHAIN)
 * -> FII B has targetRecordDate >= sourcePaymentDate and targetRecordDate >= referenceDateStr
 * -> Cash can be deployed into FII B before targetRecordDate.
 */
export function detectReinvestmentChains(
  events: FiiDividendCalendarEvent[],
  referenceDateStr: string,
): ReinvestmentDetectionResult {
  const chains: FiiReinvestmentChain[] = [];
  const candidateTickers = new Set<string>();
  const bestChainByTarget = new Map<string, FiiReinvestmentChain>();
  const targetTickerBySource = new Map<string, string>();
  const seenChainKeys = new Set<string>();

  // Filter valid events
  const validEvents = events.filter((e) => e.eventStatus !== 'UNKNOWN');

  for (const source of validEvents) {
    if (!source.paymentDate) continue;

    for (const target of validEvents) {
      if (source.ticker === target.ticker || !target.recordDate) continue;

      // Target must still be eligible for purchase from reference date onwards
      if (target.recordDate < referenceDateStr) continue;

      // Reinvestment feasible only if target recordDate >= source paymentDate
      const gap = diffCalendarDays(target.recordDate, source.paymentDate);

      // Reasonable cash deployment window (0 to 20 days)
      if (gap >= 0 && gap <= 20) {
        const sourceMonth = source.paymentDate.slice(0, 7);
        const targetMonth = target.recordDate.slice(0, 7);
        const sameMonth = sourceMonth === targetMonth;

        const isCashAvailableNow = source.paymentDate <= referenceDateStr;
        const chainType: FiiReinvestmentChainType = isCashAvailableNow
          ? 'AVAILABLE_CASH_CHAIN'
          : 'PLANNED_FUTURE_CHAIN';

        const dedupeKey = `${source.ticker}|${target.ticker}|${source.paymentDate}|${target.recordDate}`;
        if (!seenChainKeys.has(dedupeKey)) {
          seenChainKeys.add(dedupeKey);

          const chain: FiiReinvestmentChain = {
            sourceTicker: source.ticker,
            sourcePaymentDate: source.paymentDate,
            targetTicker: target.ticker,
            targetRecordDate: target.recordDate,
            daysGap: gap,
            sameMonth,
            chainType,
            cashAvailableNow: isCashAvailableNow,
            futureCashExpected: !isCashAvailableNow,
          };

          chains.push(chain);

          candidateTickers.add(target.ticker);

          // Deterministic selection of the best chain for this target
          const existingBest = bestChainByTarget.get(target.ticker);
          if (!existingBest || isBetterChain(chain, existingBest)) {
            bestChainByTarget.set(target.ticker, chain);
          }

          // Link source to target
          if (!targetTickerBySource.has(source.ticker)) {
            targetTickerBySource.set(source.ticker, target.ticker);
          }
        }
      }
    }
  }

  return {
    chains,
    candidateTickers,
    bestChainByTarget,
    targetTickerBySource,
  };
}

/**
 * Deterministic comparison: is chainA better than chainB for a given target?
 * 1. AVAILABLE_CASH_CHAIN beats PLANNED_FUTURE_CHAIN (money in hand > future money)
 * 2. Smaller daysGap
 * 3. Earlier sourcePaymentDate
 * 4. Alphabetical sourceTicker
 */
function isBetterChain(a: FiiReinvestmentChain, b: FiiReinvestmentChain): boolean {
  if (a.cashAvailableNow && !b.cashAvailableNow) return true;
  if (!a.cashAvailableNow && b.cashAvailableNow) return false;

  if (a.daysGap !== b.daysGap) {
    return a.daysGap < b.daysGap;
  }

  const dateCmp = a.sourcePaymentDate.localeCompare(b.sourcePaymentDate);
  if (dateCmp !== 0) {
    return dateCmp < 0;
  }

  return a.sourceTicker.localeCompare(b.sourceTicker) < 0;
}
