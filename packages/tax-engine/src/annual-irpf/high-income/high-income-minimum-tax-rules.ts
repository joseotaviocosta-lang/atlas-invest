import {
  HighIncomeMinimumTaxRuleSet,
  HighIncomeOfficialSourceReference,
} from './high-income-minimum-tax';

/**
 * Phase 4I.1 — Versioned high-income minimum tax rule registry.
 *
 * Every material fiscal behaviour derives from an explicitly versioned rule set
 * with an effective period and official provenance (Lei nº 15.270/2025). No
 * statutory threshold, rate or exclusion is hardcoded outside this registry.
 */

const LEI_15270_URL = 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15270.htm';
const DOU_15270_URL =
  'https://www.in.gov.br/web/dou/-/lei-n-15.270-de-26-de-novembro-de-2025-671614220';
const RFB_DIVIDENDS_FAQ_URL =
  'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/dezembro/receita-federal-lanca-perguntas-e-respostas-sobre-tributacao-de-altas-rendas-consideracoes-sobre-lucros-e-dividendos/manual_padrao_rfb_per_tributacao_sutri_v2.pdf';

const RETRIEVED_AT = '2026-10-04';

const OFFICIAL_SOURCES: readonly HighIncomeOfficialSourceReference[] = Object.freeze([
  Object.freeze({
    label: 'Lei nº 15.270/2025 (texto compilado — Planalto)',
    article: 'Art. 2º (art. 16-A da Lei 9.250/1995); Art. 3º (art. 10 e 10-A da Lei 9.249/1995)',
    url: LEI_15270_URL,
    retrievedAt: RETRIEVED_AT,
  }),
  Object.freeze({
    label: 'Lei nº 15.270/2025 (publicação original — DOU)',
    article: 'Publicação DOU de 27/11/2025; Art. 8º (produção de efeitos a partir de 01/01/2026)',
    url: DOU_15270_URL,
    retrievedAt: RETRIEVED_AT,
  }),
  Object.freeze({
    label:
      'Receita Federal — Perguntas e Respostas: Tributação de Altas Rendas (Lucros e Dividendos)',
    article: 'Itens 2, 3, 4 e 12',
    url: RFB_DIVIDENDS_FAQ_URL,
    retrievedAt: RETRIEVED_AT,
  }),
]);

const NOMINAL_CORPORATE_RATES = Object.freeze([
  Object.freeze({
    entityGroup: 'Pessoas jurídicas em geral',
    ratePercentage: '34',
    legalReference: 'Lei 9.250/1995, art. 16-B, § 1º, I',
  }),
  Object.freeze({
    entityGroup: 'Seguros privados, capitalização e LC 105, art. 1º, § 1º, II a X',
    ratePercentage: '40',
    legalReference: 'Lei 9.250/1995, art. 16-B, § 1º, II',
  }),
  Object.freeze({
    entityGroup: 'Instituições financeiras — LC 105, art. 1º, § 1º, I',
    ratePercentage: '45',
    legalReference: 'Lei 9.250/1995, art. 16-B, § 1º, III',
  }),
]);

function buildRuleSet(calendarYear: number): HighIncomeMinimumTaxRuleSet {
  return Object.freeze({
    calendarYear,
    declarationExercise: calendarYear + 1,
    ruleVersion: '2025-11-26-LEI-15270-ART-16A',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    applicabilityThreshold: '600000',
    maximumEffectiveRatePercentage: '10',
    transitionBandUpperBound: '1200000',
    nominalCorporateRates: NOMINAL_CORPORATE_RATES,
    supported: true,
    status: 'APPLICABLE',
    officialSourceReferences: OFFICIAL_SOURCES,
  });
}

/** Supported calendar years for which the statutory regime is in force. */
export const HIGH_INCOME_MINIMUM_TAX_RULE_SETS: readonly HighIncomeMinimumTaxRuleSet[] =
  Object.freeze([buildRuleSet(2026), buildRuleSet(2027)]);

/**
 * Resolves the rule set for a calendar year. Returns null when the year is not
 * covered (pre-effective years fail closed with UNSUPPORTED_YEAR).
 */
export function resolveHighIncomeMinimumTaxRuleSet(
  calendarYear: number,
): HighIncomeMinimumTaxRuleSet | null {
  const found = HIGH_INCOME_MINIMUM_TAX_RULE_SETS.find(
    (entry) => entry.calendarYear === calendarYear,
  );
  return found ?? null;
}
