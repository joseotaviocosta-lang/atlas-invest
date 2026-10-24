import type { PortfolioReview } from '@atlas/portfolio-review';

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
