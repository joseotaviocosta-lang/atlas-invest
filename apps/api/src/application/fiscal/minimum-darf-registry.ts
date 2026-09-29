import type { MinimumDarfRuleSet } from '@atlas/tax-engine';

/**
 * Phase 4E — production minimum-DARF rule (federal taxes, Lei 9.430/1996
 * art. 68, caput e § 1º; IN SRF 82/1996 arts. 1º-2º; Decreto 9.580/2018
 * (RIR/2018) art. 757, §§ 4º-5º).
 *
 * Federal tax collected under a given revenue code that, in an apuração period,
 * results in an amount strictly below R$ 10,00 is not payable through a DARF and
 * must be added to the SAME revenue code of the subsequent period(s) until the
 * total is equal to or greater than R$ 10,00 — payable at the deadline of that
 * last period. RFB's own "ReVar — Renda Variável" manual confirms the rule for
 * bolsa (renda variável) under revenue code 6015 (ADR-278).
 */
export const BR_FEDERAL_MINIMUM_DARF_RULE: MinimumDarfRuleSet = Object.freeze({
  ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
  version: '1.0.0',
  minimumAmount: '10',
  currency: 'BRL',
  effectiveFrom: '1997-01-01',
  effectiveTo: null,
  comparison: 'STRICTLY_LESS_THAN_IS_BELOW',
  sameRevenueCodeRequired: true,
  carryForwardAllowed: true,
  deferredDueDatePolicy: 'TARGET_COMPETENCE_DEADLINE',
  revenueCodes: ['6015'],
  sourceIds: [
    'LEI-9430-1996-ART-68',
    'IN-SRF-82-1996-ART-1-2',
    'DEC-9580-2018-ART-757',
    'RFB-REVAR-RENDA-VARIAVEL',
  ],
  sourceDocument: 'Lei nº 9.430/1996, art. 68, caput e § 1º',
  sourceReference:
    'https://www.planalto.gov.br/ccivil_03/leis/l9430.htm#art68 ; ' +
    'IN SRF nº 82/1996 (DOU 31/12/1996) arts. 1º-2º ; ' +
    'Decreto nº 9.580/2018 art. 757 §§ 4º-5º ; ' +
    'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/manual',
  verifiedAt: '2026-09-29',
  status: 'VERIFIED',
});

export const PRODUCTION_MINIMUM_DARF_RULE_REGISTRY: readonly MinimumDarfRuleSet[] = Object.freeze([
  BR_FEDERAL_MINIMUM_DARF_RULE,
]);
