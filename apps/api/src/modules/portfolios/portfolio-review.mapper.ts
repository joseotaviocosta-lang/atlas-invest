import type { PortfolioReview, PortfolioReviewSignalDetail } from '@atlas/portfolio-review';

export interface PortfolioReviewSignalResponse {
  id: string;
  code: string;
  category: string;
  severity: string;
  evidence: Record<string, string | number | boolean | null>;
  action: { kind: 'ROUTE' | 'NONE'; href?: string; label?: string };
}

export interface PortfolioReviewResponse {
  portfolioId: string;
  asOf: { generatedAt: string; marketDataAsOf: string | null };
  summary: { attentionCount: number; dataNote: string | null };
  dataQuality: PortfolioReview['dataQuality'];
  signals: PortfolioReviewSignalResponse[];
  isEmpty: boolean;
}

/**
 * Phase 5Q-A — review read model. Operational review state only: stable
 * signal codes, raw evidence values, navigation actions. Technical database
 * ids are stripped from evidence (STEP 43) — the UI needs tickers and
 * counts, not internal keys. No payloads, no fingerprints, no secrets.
 */
export function mapPortfolioReviewToResponse(review: PortfolioReview): PortfolioReviewResponse {
  return {
    portfolioId: review.portfolioId,
    asOf: { ...review.asOf },
    summary: { ...review.summary },
    dataQuality: {
      ...review.dataQuality,
      reconciliation: { ...review.dataQuality.reconciliation },
    },
    signals: review.signals.map((signal) => {
      const { assetId: _stripped, ...evidence } = signal.evidence as Record<
        string,
        string | number | boolean | null
      > & { assetId?: string };
      void _stripped;
      return {
        id: signal.id,
        code: signal.code,
        category: signal.category,
        severity: signal.severity,
        evidence,
        action:
          signal.action.kind === 'ROUTE'
            ? { kind: 'ROUTE' as const, href: signal.action.href, label: signal.action.label }
            : { kind: 'NONE' as const },
      };
    }),
    isEmpty: review.isEmpty,
  };
}

export interface PortfolioReviewSignalDetailResponse {
  code: string;
  state: 'ACTIVE' | 'NOT_ACTIVE';
  period: { preset: string; startDate: string; endDate: string };
  generatedAt: string;
  marketDataAsOf: string | null;
  evidence: Record<string, string | number | boolean | null> | null;
  history: unknown;
  limitations: string[];
  action: { kind: 'ROUTE' | 'NONE'; href?: string; label?: string };
  dataUsed: Record<string, string | null>;
}

/**
 * Phase 5Q-B — signal drill-down read model. Same no-internal-id rule as
 * the list mapper. dataUsed names the inputs behind the analysis
 * (coverage, market-data date, period, denominator/benchmark when they
 * apply) so the UI can render a "dados usados" section without new calls.
 */
export function mapPortfolioReviewDetailToResponse(
  detail: PortfolioReviewSignalDetail,
): PortfolioReviewSignalDetailResponse {
  let evidence: Record<string, string | number | boolean | null> | null = null;
  if (detail.evidence !== null) {
    const { assetId: _stripped, ...rest } = detail.evidence as Record<
      string,
      string | number | boolean | null
    > & { assetId?: string };
    void _stripped;
    evidence = rest;
  }
  const pick = (key: string): string | null => {
    const value = evidence?.[key];
    return typeof value === 'string' ? value : null;
  };
  return {
    code: detail.code,
    state: detail.state,
    period: { ...detail.period },
    generatedAt: detail.generatedAt,
    marketDataAsOf: detail.marketDataAsOf,
    evidence,
    history: detail.history,
    limitations: [...detail.limitations],
    action:
      detail.action.kind === 'ROUTE'
        ? { kind: 'ROUTE' as const, href: detail.action.href, label: detail.action.label }
        : { kind: 'NONE' as const },
    dataUsed: {
      coveragePercent: pick('coveragePercent'),
      marketDataAsOf: detail.marketDataAsOf,
      periodStart: detail.period.startDate,
      periodEnd: detail.period.endDate,
      denominator: pick('denominator'),
      benchmark: pick('worstBenchmark'),
    },
  };
}
