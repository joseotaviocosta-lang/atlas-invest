import { describe, expect, it } from 'vitest';
import {
  aggregateRequirements,
  buildRequirementKey,
  normalizeSubjectReference,
  type UnifiedRequirement,
} from '../../packages/tax-engine/src/annual-irpf';
import { makeModule } from './unified-annual-helpers';

function req(
  partial: Partial<UnifiedRequirement> & Pick<UnifiedRequirement, 'module'>,
): UnifiedRequirement {
  const category = partial.category ?? 'TAXPAYER_CONFIRMATIONS';
  const nativeType = partial.nativeType ?? 'TAXPAYER_CONFIRMATIONS';
  const subjectReference = normalizeSubjectReference(partial.subjectReference ?? '_ANNUAL_');
  return {
    key:
      partial.key ??
      buildRequirementKey({ module: partial.module, category, subjectReference, nativeType }),
    module: partial.module,
    category,
    nativeType,
    subjectReference,
    status: partial.status ?? 'PENDING',
    blockingReason: partial.blockingReason ?? null,
  };
}

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('Phase 4J.1 — requirement aggregation & semantic-key dedup', () => {
  it('identical semantic key collapses to a single requirement', () => {
    const a = req({ module: 'READINESS_EVIDENCE', subjectReference: 'PETR4' });
    const b = req({ module: 'READINESS_EVIDENCE', subjectReference: 'petr4' }); // normalizes equal
    const modules = [
      makeModule({ module: 'READINESS_EVIDENCE', status: 'PARTIAL', requirements: [a, b] }),
    ];
    const result = aggregateRequirements(modules);
    expect(result).toHaveLength(1);
  });

  it('similar labels with different keys stay separate', () => {
    const a = req({ module: 'READINESS_EVIDENCE', subjectReference: 'PETR4' });
    const b = req({ module: 'HIGH_INCOME_MINIMUM_TAX', subjectReference: 'PETR4' });
    const c = req({ module: 'READINESS_EVIDENCE', subjectReference: 'VALE3' });
    const modules = [
      makeModule({ module: 'READINESS_EVIDENCE', status: 'PARTIAL', requirements: [a, c] }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'PARTIAL', requirements: [b] }),
    ];
    const result = aggregateRequirements(modules);
    expect(result).toHaveLength(3);
  });

  it('aggregated keys never contain a DB UUID', () => {
    const a = req({ module: 'READINESS_EVIDENCE', subjectReference: 'PETR4' });
    const b = req({ module: 'HIGH_INCOME_MINIMUM_TAX', subjectReference: '12345678-9' });
    const modules = [
      makeModule({ module: 'READINESS_EVIDENCE', status: 'PARTIAL', requirements: [a] }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'PARTIAL', requirements: [b] }),
    ];
    const result = aggregateRequirements(modules);
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const r of result) {
      expect(r.key).not.toMatch(uuidPattern);
    }
  });

  it('buildRequirementKey normalizes the subject and never includes a raw UUID when none is supplied', () => {
    const key = buildRequirementKey({
      module: 'READINESS_EVIDENCE',
      category: 'OPENING_POSITIONS',
      subjectReference: '  Asset-X  ',
      nativeType: 'OPENING_POSITIONS',
    });
    expect(key).toBe('READINESS_EVIDENCE::OPENING_POSITIONS::asset-x::OPENING_POSITIONS');
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(key).not.toMatch(uuidPattern);
  });

  it('deduped requirements are deterministically sorted', () => {
    const z = req({ module: 'READINESS_EVIDENCE', subjectReference: 'ZZZZ' });
    const a = req({ module: 'READINESS_EVIDENCE', subjectReference: 'AAAA' });
    const modules = [
      makeModule({ module: 'READINESS_EVIDENCE', status: 'PARTIAL', requirements: [z, a] }),
    ];
    const result = aggregateRequirements(modules);
    expect(result.map((r) => r.subjectReference)).toEqual(['aaaa', 'zzzz']);
  });

  it('a subjectReference carrying a UUID is preserved in the key but the key is per-source (not strip-the-id)', () => {
    // We never put a UUID in the key in practice (service normalizes to stable
    // references). But if one leaks, dedup still relies on the full composite
    // key and does not strip ids. This asserts dedup remains stable.
    const a = req({ module: 'HIGH_INCOME_MINIMUM_TAX', subjectReference: UUID });
    const b = req({ module: 'HIGH_INCOME_MINIMUM_TAX', subjectReference: UUID });
    const modules = [
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'PARTIAL', requirements: [a, b] }),
    ];
    expect(aggregateRequirements(modules)).toHaveLength(1);
  });
});
