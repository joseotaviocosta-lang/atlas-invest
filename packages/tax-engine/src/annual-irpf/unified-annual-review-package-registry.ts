import type { FilingSupportNote } from './high-income-review-package';

/**
 * Phase 4J.2 — Unified Annual Review filing-support note registry.
 *
 * Static, deterministic support notes describing — in general terms only —
 * where each unified annual module may matter for annual filing review.
 * No note asserts an exact current official DIRPF field mapping: the official
 * PGD layout for the IRPFM Exercício 2027 had not been published by Receita
 * Federal at retrieval time (see
 * `docs/research/unified-annual-filing-support-mapping-2026.md`), so this
 * registry emits ZERO `VERIFIED_OFFICIAL_MAPPING` entries.
 */

function generalSupport(legalReference: string, text: string): FilingSupportNote {
  return { mappingStatus: 'GENERAL_SUPPORT', legalReference, text };
}

const NOTES: readonly FilingSupportNote[] = [
  generalSupport(
    'Lei nº 9.250/1995',
    'Posições anuais (4H.2): o custo histórico de aquisição apurado apoia, em termos gerais, a conferência de Bens e Direitos em 31/12. Não afirma ficha ou campo oficial da DIRPF.',
  ),
  generalSupport(
    'Lei nº 9.250/1995',
    'Mercado de capitais (4H.3): os resultados líquidos mensais por categoria apoiam, em termos gerais, a conferência de renda variável. Não afirma ficha ou campo oficial da DIRPF.',
  ),
  generalSupport(
    'Lei nº 9.250/1995; Lei nº 15.270/2025',
    'Rendimentos de investimentos (4H.4): dividendos, JCP e rendimentos de FII apoiam, em termos gerais, a conferência de rendimentos. Não afirma ficha ou campo oficial da DIRPF.',
  ),
  generalSupport(
    'RFB — Perguntas e Respostas IRPF 2026',
    'Prontidão e evidências (4H.5): pendências e confirmações apoiam a conferência de completude probatória do ano. Não afirma exigência oficial específica além do material da Receita.',
  ),
  generalSupport(
    'Lei nº 15.270/2025',
    'Tributação mínima de alta renda (4I/IRPFM): a apuração apoia, em termos gerais, a conferência da tributação mínima anual. Não afirma ficha ou campo oficial da DIRPF.',
  ),
  {
    mappingStatus: 'NO_OFFICIAL_MAPPING',
    legalReference: 'RFB — PGD DIRPF (leiaute do Exercício 2027 não publicado)',
    text: 'Mapeamento campo a campo da DIRPF não afirmado: o leiaute oficial dos campos da declaração do Exercício 2027 (ano-calendário 2026) não estava publicado pela Receita Federal na data de recuperação. Ver docs/research/unified-annual-filing-support-mapping-2026.md.',
  },
];

/** Static filing-support notes in canonical order (never reordered). */
export class UnifiedAnnualReviewFilingRegistry {
  static getNotes(): readonly FilingSupportNote[] {
    return NOTES;
  }

  static getNotesByStatus(
    status: FilingSupportNote['mappingStatus'],
  ): readonly FilingSupportNote[] {
    return NOTES.filter((note) => note.mappingStatus === status);
  }
}

/**
 * Human exercise label derived from the package identity (never hardcoded to a
 * single year: the unified package covers any supported calendar year).
 */
export function unifiedExerciseLabel(calendarYear: number, declarationExercise: number): string {
  return `Exercício ${declarationExercise} (ano-calendário ${calendarYear})`;
}
