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
