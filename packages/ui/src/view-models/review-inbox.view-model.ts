/**
 * Phase 5P-B — review inbox presentation (pure, shared).
 *
 * Human pt-BR vocabulary for derived review items. Titles and summaries are
 * built from integer counts and stable reason codes — never from financial
 * math, fingerprints, external ids or provider internals. Severity is
 * always paired with a text label, never color alone.
 */

import type { IntegrationRunTrigger } from './import-run-history.view-model';

export type ReviewSeverity = 'REVIEW' | 'WARNING' | 'ERROR';

export const REVIEW_SEVERITIES: readonly ReviewSeverity[] = ['REVIEW', 'WARNING', 'ERROR'];

export type ReviewTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ReviewSeverityPresentation {
  label: string;
  tone: ReviewTone;
  description: string;
}

export const REVIEW_SEVERITY_PRESENTATION: Record<ReviewSeverity, ReviewSeverityPresentation> = {
  REVIEW: {
    label: 'Revisão',
    tone: 'info',
    description: 'Novos registros aguardam sua confirmação.',
  },
  WARNING: {
    label: 'Atenção',
    tone: 'warning',
    description: 'Há algo para conferir antes de importar.',
  },
  ERROR: {
    label: 'Falha',
    tone: 'danger',
    description: 'Uma execução não foi concluída.',
  },
};

export type ReviewReasonCode =
  | 'NEW_RECORDS'
  | 'PROBABLE_DUPLICATE'
  | 'CONFLICT'
  | 'UNSUPPORTED_RECORD'
  | 'POSITION_DIVERGENCE'
  | 'MISSING_LOCAL_POSITION'
  | 'MISSING_SOURCE_POSITION'
  | 'UNRESOLVED_POSITION'
  | 'PARTIAL_SYNC'
  | 'SYNC_FAILED';

const REASON_COPY: Record<ReviewReasonCode, string> = {
  NEW_RECORDS: 'novas operações aguardam revisão',
  PROBABLE_DUPLICATE: 'possíveis duplicidades precisam de revisão',
  CONFLICT: 'conflito de dados precisa de resolução',
  UNSUPPORTED_RECORD: 'alguns registros ainda não são suportados',
  POSITION_DIVERGENCE: 'diferença encontrada na posição',
  MISSING_LOCAL_POSITION: 'ativo encontrado na fonte, mas não na carteira',
  MISSING_SOURCE_POSITION: 'ativo na carteira não encontrado na fonte',
  UNRESOLVED_POSITION: 'não foi possível conciliar uma posição',
  PARTIAL_SYNC: 'sincronização concluída parcialmente',
  SYNC_FAILED: 'a sincronização não foi concluída',
};

export function describeReviewReason(code: string): string {
  return (REASON_COPY as Record<string, string>)[code] ?? 'item precisa de revisão';
}

export interface ReviewItemMetrics {
  newRecords: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
  partial: boolean;
}

export interface ReviewItemInput {
  source: string;
  trigger: string | null;
  severity: ReviewSeverity;
  reasonCodes: ReviewReasonCode[];
  metrics: ReviewItemMetrics;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * One-line title for an inbox card. Counts are integers from the server;
 * no financial math happens here.
 */
export function buildReviewItemTitle(item: ReviewItemInput): string {
  if (item.severity === 'ERROR') return 'Não foi possível concluir uma sincronização';
  if (item.reasonCodes.includes('CONFLICT')) return 'Conflito de dados precisa de resolução';
  if (item.reasonCodes.includes('POSITION_DIVERGENCE')) return 'Diferença encontrada na posição';
  if (item.metrics.newRecords > 0)
    return pluralize(
      item.metrics.newRecords,
      'nova operação aguarda revisão',
      'novas operações aguardam revisão',
    );
  if (item.reasonCodes.includes('PROBABLE_DUPLICATE'))
    return 'Possíveis duplicidades precisam de revisão';
  if (item.reasonCodes.includes('PARTIAL_SYNC')) return 'Sincronização concluída parcialmente';
  if (item.reasonCodes.includes('UNSUPPORTED_RECORD'))
    return 'Alguns registros ainda não são suportados';
  return 'Item precisa de revisão';
}

export interface ReviewItemSummaryLine {
  text: string;
  tone: ReviewTone;
}

/** Reason lines for the card body, in stable reason-code order. */
export function buildReviewItemSummaryLines(item: ReviewItemInput): ReviewItemSummaryLine[] {
  const lines: ReviewItemSummaryLine[] = [];
  if (item.metrics.newRecords > 0) {
    lines.push({
      text: pluralize(
        item.metrics.newRecords,
        'nova operação encontrada',
        'novas operações encontradas',
      ),
      tone: 'info',
    });
  }
  for (const code of item.reasonCodes) {
    if (code === 'NEW_RECORDS') continue;
    lines.push({
      text: describeReviewReason(code),
      tone: code === 'CONFLICT' || code === 'POSITION_DIVERGENCE' ? 'warning' : 'neutral',
    });
  }
  if (lines.length === 0) {
    lines.push({ text: 'Nenhuma ação pendente.', tone: 'neutral' });
  }
  return lines;
}

export type ReviewActionKind = 'REVIEW_RUN' | 'VIEW_RUN';

export interface ReviewActionInput {
  kind: string;
  runId: string;
  portfolioId: string;
}

export interface ReviewAction {
  kind: ReviewActionKind;
  label: string;
}

/**
 * Route-agnostic action: clients resolve the href for their own router.
 * Both actions land on functional review/detail surfaces — never dead ends.
 */
export function reviewActionFor(action: ReviewActionInput): ReviewAction {
  if (action.kind === 'REVIEW_RUN') {
    return { kind: 'REVIEW_RUN', label: 'Revisar' };
  }
  return { kind: 'VIEW_RUN', label: 'Ver detalhes' };
}

/** Web href for a review action (import hub with run preselected). */
export function reviewActionHref(action: ReviewActionInput): string {
  return `/portfolio/import?portfolioId=${action.portfolioId}&runId=${action.runId}`;
}

export type ReviewResolvedReason = 'CONFIRMED' | 'SUPERSEDED' | 'NO_ACTION' | 'IN_PROGRESS';

export function describeResolvedReason(reason: string | null): string {
  if (reason === 'CONFIRMED') return 'Importação concluída.';
  if (reason === 'SUPERSEDED') return 'Uma execução mais recente substituiu esta pendência.';
  if (reason === 'IN_PROGRESS') return 'Execução em andamento.';
  return 'Nenhuma ação pendente.';
}

export const REVIEW_FILTERS = [
  { id: 'ALL', label: 'Todas' },
  { id: 'REVIEW', label: 'Revisão' },
  { id: 'WARNING', label: 'Avisos' },
  { id: 'ERROR', label: 'Falhas' },
] as const;

export type { IntegrationRunTrigger };
