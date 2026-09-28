import { LocalDate } from '@atlas/domain';
import type { TaxRuleSet } from '@atlas/tax-engine';

/**
 * Phase 4A rule registry.
 *
 * IMPORTANT: these are TEST-ONLY fixtures for the foundation phase. They do
 * NOT represent current Brazilian tax law and must never be used to derive a
 * payable tax liability. Production rules (4B) require VERIFIED, effective-dated
 * rule sets with official-source provenance (ADR-237, ADR-245).
 */
export const FISCAL_RULE_REGISTRY: readonly TaxRuleSet[] = Object.freeze([
  {
    id: 'BR-TEST-2026',
    jurisdiction: 'BR',
    version: 'BR_TEST_2026_V1',
    effectiveFrom: LocalDate.from('2020-01-01'),
    status: 'TEST_ONLY',
    source: {
      legalSourceId: 'TEST_ONLY',
      legalSourceReference: 'Phase 4A foundation fixture — NOT Brazilian tax law',
    },
  },
]);

/**
 * Phase 4B.5 production rule registry.
 *
 * Contains officially-verified, effective-dated Brazilian investment tax rules.
 * Every entry carries machine-readable legal provenance (`legalSourceId`,
 * `legalSourceReference`, `verifiedAt`) and is only added after fresh official
 * verification of current applicability (ADR-245). TEST_ONLY fixtures are never
 * placed here.
 *
 * Activated bucket: FII_SALE (sale/redemption of FII quotas).
 */
export const BR_FII_SALE_RULE: TaxRuleSet = Object.freeze({
  id: 'BR-FII-SALE-20-2015',
  jurisdiction: 'BR',
  version: '1.0.0',
  status: 'VERIFIED',
  taxCategory: 'FII',
  effectiveFrom: LocalDate.from('2015-09-01'),
  components: {
    ratePercentage: '20',
    // The 0,005% IRRF on mercado à vista operations (Lei 11.033/2004, art. 2º, § 1º)
    // is applied from the canonical withholding input; when absent the result
    // fails closed (PARTIAL) rather than overstating the liability.
    withholding: { ratePercentage: '0.005' },
    // No exemption threshold for FII quota gains (unlike Brazilian equity).
    // Loss compensation is bucket-isolated (IN RFB 1.585/2015, art. 37, § 2º).
  },
  source: {
    legalSourceId: 'IN-RFB-1585-2015-ART-37',
    legalSourceReference:
      'Lei nº 8.668/1993, art. 18 (red. Lei nº 9.779/1999); IN RFB nº 1.585/2015, art. 37 e § 2º; Lei nº 11.033/2004, art. 2º, § 1º',
    verifiedAt: '2026-09-28',
  },
});

export const PRODUCTION_TAX_RULE_REGISTRY: readonly TaxRuleSet[] = Object.freeze([
  BR_FII_SALE_RULE,
]);
