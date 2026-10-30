import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  sha256Hex,
  validateCostEvidenceInput,
  computeCostEvidenceFingerprint,
  computeCostLotKey,
  coveragePercent,
  Quantity,
  InvalidCostEvidenceError,
  COST_EVIDENCE_TYPES,
  COST_EVIDENCE_STATUSES,
} from '../../packages/domain/src/index';

const BASE = {
  portfolioId: '11111111-1111-4111-8111-111111111111',
  accountId: '22222222-2222-4222-8222-222222222222',
  assetId: '33333333-3333-4333-8333-333333333333',
  evidenceType: 'BROKERAGE_NOTE',
  sourceType: 'MANUAL_CONFIRMED',
  quantityCovered: '120',
  unitCost: '8.50',
  totalCost: '1020.00',
  currency: 'BRL',
  acquisitionDate: '2024-12-26',
  sourceReference: ' XP-NOTA-2024-1234 ',
  notes: ' Nota de corretagem XP ',
};

describe('Domain: bundler-safe sha256 matches Node crypto', () => {
  const vectors = [
    '',
    'abc',
    '11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222',
    'Nota de corretagem — pregão 26/12/2024 ₽',
    'emoji 🎯 surrogate-pair ✓ test',
    'a'.repeat(1000),
  ];
  for (const input of vectors) {
    it(`matches Node for ${JSON.stringify(input.slice(0, 24))}…`, () => {
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    });
  }

  it('matches the NIST empty-string vector', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('Domain: cost-basis evidence validation', () => {
  it('accepts a fully specified KCRE11-shaped record and freezes it', () => {
    const ev = validateCostEvidenceInput(BASE);
    expect(ev.quantityCovered.value).toBe('120');
    expect(ev.unitCost?.amount).toBe('8.5');
    expect(ev.totalCost.amount).toBe('1020');
    expect(ev.currency).toBe('BRL');
    expect(ev.acquisitionDate.toString()).toBe('2024-12-26');
    expect(ev.status).toBe('REVIEW_REQUIRED');
    expect(ev.sourceReference).toBe('XP-NOTA-2024-1234');
    expect(ev.notes).toBe('Nota de corretagem XP');
    expect(Object.isFrozen(ev)).toBe(true);
  });

  it('derives the missing cost side exactly', () => {
    const fromUnit = validateCostEvidenceInput({ ...BASE, totalCost: undefined });
    expect(fromUnit.totalCost.amount).toBe('1020');
    const fromTotal = validateCostEvidenceInput({ ...BASE, unitCost: undefined });
    expect(fromTotal.unitCost?.amount).toBe('8.5');
  });

  it('requires at least one cost side', () => {
    expect(() =>
      validateCostEvidenceInput({ ...BASE, unitCost: undefined, totalCost: undefined }),
    ).toThrow(InvalidCostEvidenceError);
  });

  it('rejects unit/total mismatch without reconciling (COST_EVIDENCE_AMOUNT_MISMATCH)', () => {
    expect(() =>
      validateCostEvidenceInput({ ...BASE, totalCost: '1020.01' }),
    ).toThrow(/COST_EVIDENCE_AMOUNT_MISMATCH/);
  });

  it('rejects zero/negative quantities and negative costs', () => {
    expect(() => validateCostEvidenceInput({ ...BASE, quantityCovered: '0' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() => validateCostEvidenceInput({ ...BASE, quantityCovered: '-5' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() => validateCostEvidenceInput({ ...BASE, unitCost: '-8.50', totalCost: undefined })).toThrow(
      InvalidCostEvidenceError,
    );
  });

  it('allows known-zero cost (distinct from unknown cost)', () => {
    const ev = validateCostEvidenceInput({ ...BASE, unitCost: '0', totalCost: '0.00' });
    expect(ev.totalCost.amount).toBe('0');
  });

  it('rejects unknown type/source and bad dates/references', () => {
    expect(() => validateCostEvidenceInput({ ...BASE, evidenceType: 'GUESS' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() => validateCostEvidenceInput({ ...BASE, sourceType: 'RUMOR' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() => validateCostEvidenceInput({ ...BASE, acquisitionDate: '2026-02-30' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() => validateCostEvidenceInput({ ...BASE, acquisitionDate: '26/12/2024' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() => validateCostEvidenceInput({ ...BASE, sourceReference: '   ' })).toThrow(
      InvalidCostEvidenceError,
    );
    expect(() =>
      validateCostEvidenceInput({ ...BASE, currency: 'XXX' }),
    ).toThrow();
  });

  it('rejects malformed UUIDs and decimal strings', () => {
    expect(() => validateCostEvidenceInput({ ...BASE, assetId: 'not-a-uuid' })).toThrow();
    expect(() => validateCostEvidenceInput({ ...BASE, quantityCovered: 'abc' })).toThrow(
      InvalidCostEvidenceError,
    );
  });

  it('exposes frozen vocabulary', () => {
    expect(COST_EVIDENCE_TYPES).toContain('BROKERAGE_NOTE');
    expect(COST_EVIDENCE_STATUSES).toEqual(['DRAFT', 'REVIEW_REQUIRED', 'VERIFIED', 'REJECTED']);
  });
});

describe('Domain: cost-evidence fingerprint and lot identity', () => {
  const fpInput = {
    portfolioId: BASE.portfolioId,
    accountId: BASE.accountId,
    assetId: BASE.assetId,
    evidenceType: 'BROKERAGE_NOTE',
    acquisitionDate: '2024-12-26',
    quantityCovered: '120',
    unitCost: '8.50',
    totalCost: '1020.00',
    currency: 'BRL',
    sourceReference: 'XP-NOTA-2024-1234',
    source: 'MANUAL_CONFIRMED',
  };

  it('is deterministic and ignores resubmission noise', () => {
    const a = computeCostEvidenceFingerprint(fpInput);
    const b = computeCostEvidenceFingerprint({ ...fpInput, sourceReference: '  XP-NOTA-2024-1234 ' });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes on any semantic field', () => {
    const a = computeCostEvidenceFingerprint(fpInput);
    expect(computeCostEvidenceFingerprint({ ...fpInput, quantityCovered: '100' })).not.toBe(a);
    expect(computeCostEvidenceFingerprint({ ...fpInput, unitCost: '8.51', totalCost: '1021.20' })).not.toBe(a);
    expect(computeCostEvidenceFingerprint({ ...fpInput, acquisitionDate: '2024-12-27' })).not.toBe(a);
    expect(computeCostEvidenceFingerprint({ ...fpInput, sourceReference: 'OTHER-DOC' })).not.toBe(a);
  });

  it('collides same-lot evidence across documents, splits distinct lots', () => {
    const lot = {
      assetId: BASE.assetId,
      accountId: BASE.accountId,
      acquisitionDate: '2024-12-26',
      quantityCovered: '120',
      unitCost: '8.50',
      totalCost: '1020.00',
      currency: 'BRL',
    };
    // Same economics, different document → same lot key (never summed).
    expect(computeCostLotKey(lot)).toBe(computeCostLotKey(lot));
    // Different date, price or quantity → distinct lot.
    expect(computeCostLotKey({ ...lot, acquisitionDate: '2025-01-24' })).not.toBe(
      computeCostLotKey(lot),
    );
    expect(computeCostLotKey({ ...lot, unitCost: '8.45', totalCost: '1014.00' })).not.toBe(
      computeCostLotKey(lot),
    );
  });
});

describe('Domain: coverage percent math', () => {
  it('computes exact 2-decimal coverage', () => {
    expect(coveragePercent(Quantity.from('120'), Quantity.from('300'))).toBe('40.00');
    expect(coveragePercent(Quantity.from('300'), Quantity.from('300'))).toBe('100.00');
    expect(coveragePercent(Quantity.from('0'), Quantity.from('300'))).toBe('0.00');
  });

  it('refuses zero totals', () => {
    expect(() => coveragePercent(Quantity.from('1'), Quantity.from('0'))).toThrow(
      InvalidCostEvidenceError,
    );
  });
});
