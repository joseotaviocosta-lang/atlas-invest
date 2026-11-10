import {
  FiiDividendCalendarEvent,
  FiiDividendEligibilityStatus,
  FiiReinvestmentChain,
} from './types';

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

/**
 * Pure deterministic calculation of dividend eligibility relative to the reference date (APP-16I).
 *
 * Strict Entitlement Rule:
 * - refDate < recordDate: ELIGIBLE (within data-com, buyer is entitled to announced dividend).
 * - refDate === recordDate: RECORD_DATE_TODAY (last day to acquire with dividend rights).
 * - refDate > recordDate: EX_DIVIDEND (entitlement passed; buyer will NOT receive this cycle's dividend).
 */
export function calculateDividendEligibility(
  recordDate: string | null,
  referenceDateStr: string,
): {
  eligibilityStatus: FiiDividendEligibilityStatus;
  daysUntilRecordDate: number | null;
} {
  if (!recordDate) {
    return {
      eligibilityStatus: 'UNKNOWN',
      daysUntilRecordDate: null,
    };
  }

  const daysUntil = diffCalendarDays(recordDate, referenceDateStr);

  if (referenceDateStr < recordDate) {
    return {
      eligibilityStatus: 'ELIGIBLE',
      daysUntilRecordDate: daysUntil,
    };
  }

  if (referenceDateStr === recordDate) {
    return {
      eligibilityStatus: 'RECORD_DATE_TODAY',
      daysUntilRecordDate: 0,
    };
  }

  // referenceDateStr > recordDate
  return {
    eligibilityStatus: 'EX_DIVIDEND',
    daysUntilRecordDate: daysUntil,
  };
}

/**
 * Computes Dividend Calendar Fit score (0..100) or null if UNKNOWN/disabled (APP-16I).
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
    return 25; // Ex-dividend for this cycle; buyer misses announced dividend
  }

  return null;
}

export interface ReinvestmentDetectionResult {
  chains: FiiReinvestmentChain[];
  candidateTickers: Set<string>;
  targetTickerBySource: Map<string, string>;
}

/**
 * Detects cross-FII dividend reinvestment sequences in the portfolio (APP-16I).
 *
 * Sequence:
 * FII A pays dividend on sourcePaymentDate
 * -> Cash becomes available
 * -> FII B has targetRecordDate >= sourcePaymentDate
 * -> Cash can be deployed into FII B before targetRecordDate.
 */
export function detectReinvestmentChains(
  events: FiiDividendCalendarEvent[],
  referenceDateStr: string,
): ReinvestmentDetectionResult {
  const chains: FiiReinvestmentChain[] = [];
  const candidateTickers = new Set<string>();
  const targetTickerBySource = new Map<string, string>();

  // Filter valid events
  const validEvents = events.filter((e) => e.eventStatus !== 'UNKNOWN');

  for (const source of validEvents) {
    if (!source.paymentDate) continue;

    for (const target of validEvents) {
      if (source.ticker === target.ticker || !target.recordDate) continue;

      // Reinvestment feasible only if target recordDate >= source paymentDate
      const gap = diffCalendarDays(target.recordDate, source.paymentDate);

      // Reasonable cash deployment window (0 to 20 days)
      if (gap >= 0 && gap <= 20) {
        const sourceMonth = source.paymentDate.slice(0, 7);
        const targetMonth = target.recordDate.slice(0, 7);
        const sameMonth = sourceMonth === targetMonth;

        chains.push({
          sourceTicker: source.ticker,
          sourcePaymentDate: source.paymentDate,
          targetTicker: target.ticker,
          targetRecordDate: target.recordDate,
          daysGap: gap,
          sameMonth,
        });

        // If target is still eligible for purchase from reference date onwards
        if (target.recordDate >= referenceDateStr) {
          candidateTickers.add(target.ticker);
          targetTickerBySource.set(source.ticker, target.ticker);
        }
      }
    }
  }

  // Also check if any source already paid earlier in the current month
  // and target is still within data-com in the same month
  for (const target of validEvents) {
    if (!target.recordDate || target.recordDate < referenceDateStr) continue;
    const targetMonth = target.recordDate.slice(0, 7);
    const refMonth = referenceDateStr.slice(0, 7);

    for (const source of validEvents) {
      if (source.ticker === target.ticker || !source.paymentDate) continue;
      const sourceMonth = source.paymentDate.slice(0, 7);
      if (sourceMonth === refMonth && targetMonth === refMonth && source.paymentDate <= target.recordDate) {
        candidateTickers.add(target.ticker);
      }
    }
  }

  return {
    chains,
    candidateTickers,
    targetTickerBySource,
  };
}
