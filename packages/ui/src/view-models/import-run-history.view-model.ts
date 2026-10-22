/**
 * Phase 5P-PRE — import/sync run history presentation (pure, shared).
 *
 * Human pt-BR vocabulary for operational run states and summaries. Technical
 * internals (fingerprints, external ids, reconciliation enums, provider
 * DTOs) never reach the UI; counts and safe statuses do.
 */

export const IMPORT_RUN_STATUSES = [
  'STARTED',
  'AWAITING_REVIEW',
  'CONFIRMING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export type ImportRunTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ImportRunStatusPresentation {
  label: string;
  tone: ImportRunTone;
  description: string;
}

export const IMPORT_RUN_STATUS_PRESENTATION: Record<ImportRunStatus, ImportRunStatusPresentation> =
  {
    STARTED: {
      label: 'Iniciada',
      tone: 'info',
      description: 'Execução iniciada. Coletando registros da fonte.',
    },
    AWAITING_REVIEW: {
      label: 'Aguardando revisão',
      tone: 'warning',
      description: 'Revise os registros antes de confirmar. Nada foi gravado no livro-razão.',
    },
    CONFIRMING: {
      label: 'Confirmando',
      tone: 'info',
      description: 'Gravando os registros confirmados no livro-razão.',
    },
    COMPLETED: {
      label: 'Concluída',
      tone: 'success',
      description: 'Registros confirmados gravados no livro-razão.',
    },
    PARTIAL: {
      label: 'Concluída parcialmente',
      tone: 'warning',
      description: 'Parte dos registros não pôde ser concluída. O que foi confirmado está gravado.',
    },
    FAILED: {
      label: 'Falhou',
      tone: 'danger',
      description: 'Não foi possível concluir esta execução. Tente novamente.',
    },
  };

export interface ImportRunSummaryCounts {
  fetched: number;
  normalized: number;
  added: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  confirmed: number;
  ignored: number;
  divergent: number;
}

export interface ImportRunSummaryLine {
  text: string;
  tone: ImportRunTone;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * One-line-per-fact summary of a run for list rows and detail headers.
 * Never suggests full success when failures or divergences exist.
 */
export function buildImportRunSummaryLines(counts: ImportRunSummaryCounts): ImportRunSummaryLine[] {
  const lines: ImportRunSummaryLine[] = [];
  if (counts.added > 0) {
    lines.push({
      text: pluralize(counts.added, 'novo registro encontrado', 'novos registros encontrados'),
      tone: 'info',
    });
  }
  const known = counts.exactDuplicates;
  if (known > 0) {
    lines.push({
      text: pluralize(known, 'registro já conhecido', 'registros já conhecidos'),
      tone: 'neutral',
    });
  }
  const review = counts.probableDuplicates + counts.conflicts + counts.unsupported + counts.invalid;
  if (review > 0) {
    lines.push({
      text: pluralize(review, 'item precisa de revisão', 'itens precisam de revisão'),
      tone: 'warning',
    });
  }
  if (counts.confirmed > 0) {
    lines.push({
      text: pluralize(counts.confirmed, 'registro importado', 'registros importados'),
      tone: 'success',
    });
  }
  if (counts.divergent > 0) {
    lines.push({
      text: pluralize(counts.divergent, 'diferença encontrada', 'diferenças encontradas'),
      tone: 'warning',
    });
  }
  if (lines.length === 0) {
    lines.push({ text: 'Nenhum registro novo na fonte.', tone: 'neutral' });
  }
  return lines;
}

/** Human source label. B3 stays neutral text (no logo, no endorsement). */
export function describeImportRunSource(source: string, fileName: string | null): string {
  if (source === 'B3') return 'Sincronização B3';
  if (source === 'CSV') return fileName ? `Arquivo ${fileName}` : 'Arquivo CSV';
  if (source === 'MANUAL') return 'Lançamento manual';
  return 'Importação';
}

export interface ImportRunReconciliationCounts {
  matched: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
}

/** Human reconciliation breakdown for run detail views. */
export function buildImportRunReconciliationLines(
  reconciliation: ImportRunReconciliationCounts,
): Array<{ text: string; tone: ImportRunTone }> {
  return [
    {
      text: pluralize(reconciliation.matched, 'posição conferida', 'posições conferidas'),
      tone: 'success',
    },
    ...(reconciliation.divergent > 0
      ? [
          {
            text: pluralize(
              reconciliation.divergent,
              'diferença encontrada',
              'diferenças encontradas',
            ),
            tone: 'warning' as ImportRunTone,
          },
        ]
      : []),
    ...(reconciliation.missingLocal > 0
      ? [
          {
            text: pluralize(
              reconciliation.missingLocal,
              'ativo encontrado só na fonte',
              'ativos encontrados só na fonte',
            ),
            tone: 'info' as ImportRunTone,
          },
        ]
      : []),
    ...(reconciliation.missingSource > 0
      ? [
          {
            text: pluralize(
              reconciliation.missingSource,
              'ativo existente só na carteira',
              'ativos existentes só na carteira',
            ),
            tone: 'info' as ImportRunTone,
          },
        ]
      : []),
    ...(reconciliation.unresolved > 0
      ? [
          {
            text: pluralize(
              reconciliation.unresolved,
              'posição não conciliada',
              'posições não conciliadas',
            ),
            tone: 'neutral' as ImportRunTone,
          },
        ]
      : []),
  ];
}
