/**
 * Phase 5D-H1: deterministic macro indicator presentation.
 *
 * The macro context is fetched client-side. To keep the server-rendered markup
 * and the first client hydration pass byte-for-byte compatible, the card
 * builder accepts a `hydrated` flag. Before hydration completes, callers must
 * pass `hydrated: false`, which renders the same honest placeholders as the
 * server regardless of any warm React Query cache.
 */

export interface MacroRateSeries {
  rate: string;
  effectiveDate: string;
  source: string;
}

export interface MacroIpcaSeries {
  referenceMonth: string;
  value: string;
  source: string;
  publishedAt?: string;
}

export interface MacroContextResponse {
  data: {
    ipcaMonthly?: MacroIpcaSeries;
    selicTarget?: MacroRateSeries;
    selicEffective?: MacroRateSeries;
  };
}

export const MACRO_CONTEXT_QUERY_KEY = ['macro-context'] as const;

export const MACRO_CONTEXT_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
};

export const MACRO_PLACEHOLDER = '—';

export type MacroIndicatorId = 'IBOVESPA' | 'SELIC_META' | 'SELIC_EFETIVA' | 'IPCA' | 'PTAX';

export interface MacroIndicatorCard {
  id: MacroIndicatorId;
  label: string;
  value: string;
  subValue: string;
  isPlaceholder: boolean;
}

export interface BuildMacroIndicatorCardsOptions {
  /**
   * False during SSR and the first client hydration render. Defaults to true
   * for consumers that explicitly want the resolved persisted values.
   */
  hydrated?: boolean;
}

export function buildMacroIndicatorCards(
  context: MacroContextResponse | undefined,
  options: BuildMacroIndicatorCardsOptions = {},
): MacroIndicatorCard[] {
  const hydrated = options.hydrated ?? true;
  const data = hydrated ? context?.data : undefined;

  const selicTarget = data?.selicTarget;
  const selicEffective = data?.selicEffective;
  const ipca = data?.ipcaMonthly;

  return [
    {
      id: 'IBOVESPA',
      label: 'IBOVESPA',
      value: MACRO_PLACEHOLDER,
      subValue: 'Integração futura oficial B3',
      isPlaceholder: true,
    },
    {
      id: 'SELIC_META',
      label: 'SELIC META',
      value: selicTarget?.rate ?? MACRO_PLACEHOLDER,
      subValue: selicTarget
        ? `Meta Copom (${selicTarget.effectiveDate})`
        : 'Meta Copom — aguardando dados oficiais',
      isPlaceholder: !selicTarget,
    },
    {
      id: 'SELIC_EFETIVA',
      label: 'SELIC EFETIVA',
      value: selicEffective?.rate ?? MACRO_PLACEHOLDER,
      subValue: selicEffective
        ? `Efetiva anualizada (${selicEffective.effectiveDate})`
        : 'Efetiva anualizada — aguardando dados oficiais',
      isPlaceholder: !selicEffective,
    },
    {
      id: 'IPCA',
      label: 'IPCA (MENSAL)',
      value: ipca?.value ?? MACRO_PLACEHOLDER,
      subValue: ipca
        ? `Variação mensal (${ipca.referenceMonth})`
        : 'Índice de inflação IBGE/Bacen — aguardando dados oficiais',
      isPlaceholder: !ipca,
    },
    {
      id: 'PTAX',
      label: 'DÓLAR (PTAX)',
      value: MACRO_PLACEHOLDER,
      subValue: 'Cotação oficial Bacen — integração futura',
      isPlaceholder: true,
    },
  ];
}
