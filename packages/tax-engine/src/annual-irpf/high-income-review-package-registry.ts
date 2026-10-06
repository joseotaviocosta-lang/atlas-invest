import { FilingMappingStatus, FilingSupportNote } from './high-income-review-package';

/**
 * Static filing-mapping registry for the Phase 4I.6 high-income review package.
 *
 * Mirrors the structure of `annual-tax-reporting-registry.ts`. Each note carries
 * a `mappingStatus` (default `GENERAL_SUPPORT`), a `legalReference` and `text`.
 *
 * Zero-unproven-official-mappings invariant: the registry ships 0 entries that
 * assert a specific DIRPF field as `VERIFIED_OFFICIAL_MAPPING`, because the IRPFM
 * exercício-2027 field layout is not officially published at retrieval time.
 */
export class HighIncomeReviewFilingRegistry {
  private static readonly NOTES: readonly FilingSupportNote[] = [
    {
      mappingStatus: 'GENERAL_SUPPORT',
      legalReference: 'Lei nº 15.270/2025',
      text:
        'Este pacote apoia a revisão da tributação mínima de alta renda (IRPFM) referente ao ' +
        'Exercício 2027 (ano-calendário 2026). Os valores são de conferência e não substituem a ' +
        'declaração oficial.',
    },
    {
      mappingStatus: 'NO_OFFICIAL_MAPPING',
      legalReference: 'Lei nº 15.270/2025',
      text:
        'O leiaute oficial dos campos da DIRPF para o IRPFM do Exercício 2027 ainda não foi ' +
        'publicado pela Receita Federal. Não há mapeamento campo-a-campo oficial disponível.',
    },
    {
      mappingStatus: 'GENERAL_SUPPORT',
      legalReference: 'Lei nº 9.250/1995',
      text:
        'Confira os rendimentos, créditos e o redutor societário por fonte pagadora com o seu ' +
        'contador antes do preenchimento da declaração anual.',
    },
  ];

  static getNotes(): readonly FilingSupportNote[] {
    return this.NOTES.map((note) => ({ ...note }));
  }

  static getNotesByStatus(status: FilingMappingStatus): readonly FilingSupportNote[] {
    return this.getNotes().filter((note) => note.mappingStatus === status);
  }
}

/** Exercise label helper enforcing the legal-freshness exercício-2027 caveat. */
export function exerciseLabel(): string {
  return 'Exercício 2027 (ano-calendário 2026)';
}
