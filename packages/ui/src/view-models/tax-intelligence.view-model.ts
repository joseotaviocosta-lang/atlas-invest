import { formatDate } from '../formatters';

/**
 * Contextual tax intelligence view-model (CTI-2, ADR-311).
 *
 * Presentation only: renders the deterministic CTI-1 response verbatim.
 * NEVER recomputes tax status, NEVER reorders blockers, NEVER invents
 * actions. All fiscal semantics arrive from
 * `GET /api/v1/portfolios/:id/tax-intelligence`.
 */

export interface RawTaxIntelligenceFact {
  code: string;
  label: string;
  value: string | null;
  source: string;
}

export interface RawTaxIntelligenceBlocker {
  code: string;
  category: string;
  priority: number;
  title: string;
  explanation: string;
}

export interface RawTaxIntelligenceAction {
  actionId: string;
  label: string;
  priority: number;
}

export interface RawTaxIntelligenceSource {
  kind: string;
  label: string;
}

export interface RawTaxIntelligenceResponse {
  status: string;
  headline: string;
  summary: string;
  facts: RawTaxIntelligenceFact[];
  blockers: RawTaxIntelligenceBlocker[];
  actions: RawTaxIntelligenceAction[];
  limitations: string[];
  sources: RawTaxIntelligenceSource[];
  generatedAt: string;
}

export function taxIntelligenceQueryKey(
  portfolioId: string | null,
  competence: string,
): readonly string[] {
  return ['tax-intelligence', portfolioId ?? 'none', competence];
}

export type CtiStatusVariant = 'success' | 'warning' | 'danger' | 'neutral';

export interface CtiStatusPresentation {
  label: string;
  variant: CtiStatusVariant;
}

/**
 * Pure presentation mapping of the canonical CTI status. Unknown statuses
 * degrade to neutral "unavailable" — never upgraded.
 */
export function mapCtiStatusToPresentation(status: string): CtiStatusPresentation {
  switch (status) {
    case 'CONFIRMED':
      return { label: 'Situação confirmada', variant: 'success' };
    case 'PARTIAL':
      return { label: 'Apuração parcial', variant: 'warning' };
    case 'BLOCKED':
      return { label: 'Apuração bloqueada', variant: 'danger' };
    default:
      return { label: 'Situação indisponível', variant: 'neutral' };
  }
}

export interface CtiActionTarget {
  href: string;
  label: string;
}

/**
 * Allowlisted actionId → existing product route. Navigation only. Any id
 * outside the allowlist resolves to null and is never rendered as a button.
 */
export function mapCtiActionToTarget(
  actionId: string,
  label: string,
  portfolioId: string,
): CtiActionTarget | null {
  const portfolioOverview = `/portfolio?portfolioId=${portfolioId}&tab=overview`;
  switch (actionId) {
    case 'OPEN_TAX':
    case 'OPEN_TAX_QUALITY':
      return { href: '/tax', label };
    case 'REVIEW_COST_BASIS':
    case 'REVIEW_POSITIONS':
      return { href: portfolioOverview, label };
    case 'REVIEW_IMPORTS':
      return { href: '/portfolio/import', label };
    case 'OPEN_DATA_QUALITY':
      return { href: '/portfolio/maintenance', label };
    case 'OPEN_REVIEWS':
      return { href: '/reviews', label };
    case 'OPEN_PORTFOLIO':
      return { href: portfolioOverview, label };
    case 'OPEN_ANNUAL_READINESS':
      return { href: '/tax', label };
    case 'OPEN_OBLIGATION':
      return { href: '/tax', label };
    default:
      return null;
  }
}

export function formatCtiGeneratedAt(generatedAt: string): string {
  const formatted = formatDate(generatedAt);
  return formatted && formatted !== '—' ? `Explicação gerada em ${formatted}` : '';
}
