import { describe, expect, it } from 'vitest';
import {
  resolveFederalTaxDeadline,
  activeVerifiedDeadlineEntries,
  validateFederalTaxDeadlineEntry,
  isCanonicalCivilDate,
  type FederalTaxDeadlineEntry,
} from '@atlas/tax-engine';
import { PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY } from '../../apps/api/src/application/fiscal/federal-tax-deadline-registry';

function entry(over: Partial<FederalTaxDeadlineEntry> & { id: string }): FederalTaxDeadlineEntry {
  return {
    revenueCode: '6015',
    taxBucket: 'FII_SALE',
    competence: '2026-08',
    dueDate: '2026-09-30',
    status: 'VERIFIED',
    sourceAuthority: 'RFB',
    sourceDocument: 'ADE CORAT nº 63/2026',
    sourceReference: 'https://www.gov.br/receitafederal',
    sourcePublishedAt: '2026-08-27',
    verifiedAt: '2026-09-28',
    version: 1,
    supersedesEntryId: null,
    ...over,
  };
}

describe('Phase 4C.2 — FederalTaxDeadlineRegistry (direct official authority)', () => {
  it('contains the real production entry 6015 / 2026-08 / 2026-09-30 with provenance', () => {
    const prod = PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY.find(
      (e) => e.revenueCode === '6015' && e.competence === '2026-08',
    );
    expect(prod).toBeDefined();
    expect(prod!.dueDate).toBe('2026-09-30');
    expect(prod!.status).toBe('VERIFIED');
    expect(prod!.sourceAuthority).toBe('RFB');
    expect(prod!.sourceDocument).toContain('ADE CORAT');
    expect(prod!.sourceReference).toContain('gov.br');
  });

  it('every production entry is structurally valid', () => {
    for (const e of PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY) {
      expect(validateFederalTaxDeadlineEntry(e)).toEqual([]);
    }
  });

  it('resolves a verified entry deterministically', () => {
    const res = resolveFederalTaxDeadline({
      entries: PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY,
      revenueCode: '6015',
      competence: '2026-08',
    });
    expect(res.outcome).toBe('RESOLVED');
    expect(res.entry?.dueDate).toBe('2026-09-30');
  });

  it('fails closed when no official entry exists', () => {
    const res = resolveFederalTaxDeadline({
      entries: PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY,
      revenueCode: '6015',
      competence: '2099-01',
    });
    expect(res.outcome).toBe('MISSING_OFFICIAL_DEADLINE');
    expect(res.entry).toBeNull();
  });

  it('fails closed on ambiguous duplicate active VERIFIED entries', () => {
    const res = resolveFederalTaxDeadline({
      entries: [entry({ id: 'a' }), entry({ id: 'b' })],
      revenueCode: '6015',
      competence: '2026-08',
    });
    expect(res.outcome).toBe('AMBIGUOUS_OFFICIAL_DEADLINE');
    expect(res.entry).toBeNull();
  });

  it('ignores SUPERSEDED/REVOKED versions (versioning/correction)', () => {
    const entries = [
      entry({ id: 'v1', status: 'SUPERSEDED', dueDate: '2026-09-30' }),
      entry({ id: 'v2', version: 2, dueDate: '2026-10-02', supersedesEntryId: 'v1' }),
    ];
    const res = resolveFederalTaxDeadline({ entries, revenueCode: '6015', competence: '2026-08' });
    expect(res.outcome).toBe('RESOLVED');
    expect(res.entry?.id).toBe('v2');
    expect(res.entry?.dueDate).toBe('2026-10-02');
    expect(activeVerifiedDeadlineEntries(entries, '6015', '2026-08')).toHaveLength(1);
  });

  it('supports historical read without future leakage', () => {
    const entries = PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY;
    const historical = resolveFederalTaxDeadline({
      entries,
      revenueCode: '6015',
      competence: '2025-07',
    });
    expect(historical.outcome).toBe('RESOLVED');
    expect(historical.entry?.dueDate).toBe('2025-08-29');
    // A different competence never resolves to another competence's entry.
    const leaked = resolveFederalTaxDeadline({
      entries,
      revenueCode: '6015',
      competence: '2026-12',
    });
    expect(leaked.outcome).toBe('MISSING_OFFICIAL_DEADLINE');
  });

  it('rejects invalid civil dates and competences structurally', () => {
    expect(isCanonicalCivilDate('2026-02-30')).toBe(false);
    expect(isCanonicalCivilDate('2026-09-30')).toBe(true);
    const invalid = validateFederalTaxDeadlineEntry(entry({ id: 'x', dueDate: '2026-02-30' }));
    expect(invalid).toContain('INVALID_DUE_DATE');
  });
});
