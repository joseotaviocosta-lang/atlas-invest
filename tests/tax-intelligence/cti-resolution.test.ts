import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveTaxCost,
  InvalidTaxCostResolutionInput,
  type ResolveTaxCostInput,
  type TaxResolutionEvidenceRowInput,
} from '../../packages/tax-intelligence/src/index';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';

function ledgerLot(overrides: Record<string, string> = {}) {
  return {
    transactionId: 'tx-1',
    quantity: '80',
    acquisitionDate: '2024-12-27',
    unitCost: '8.45',
    totalCost: '676.00',
    currency: 'BRL',
    ...overrides,
  };
}

function evidenceRow(overrides: Partial<TaxResolutionEvidenceRowInput> = {}): TaxResolutionEvidenceRowInput {
  return {
    evidenceId: 'ev-1',
    evidenceVersion: 1,
    evidenceFingerprint: 'f'.repeat(64),
    evidenceType: 'BROKERAGE_NOTE',
    accountId: ACCOUNT,
    assetId: ASSET,
    acquisitionDate: '2024-12-26',
    quantityCovered: '120',
    unitCost: '8.50',
    totalCost: '1020.00',
    currency: 'BRL',
    status: 'VERIFIED',
    supersedesId: null,
    verifiedBy: 'owner-1',
    verifiedAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  };
}

function input(overrides: Partial<ResolveTaxCostInput> = {}): ResolveTaxCostInput {
  return {
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    positionQuantity: '300',
    positionCurrency: 'BRL',
    ledgerLots: [],
    evidenceRows: [],
    ...overrides,
  };
}

function kcre11Input(): ResolveTaxCostInput {
  return input({
    positionQuantity: '300',
    ledgerLots: [
      ledgerLot({ transactionId: 'tx-buy-1', quantity: '80', acquisitionDate: '2024-12-27', unitCost: '8.45', totalCost: '676.00' }),
      ledgerLot({ transactionId: 'tx-buy-2', quantity: '96', acquisitionDate: '2025-01-24', unitCost: '7.99', totalCost: '767.04' }),
      ledgerLot({ transactionId: 'tx-buy-3', quantity: '4', acquisitionDate: '2025-01-24', unitCost: '7.98', totalCost: '31.92' }),
    ],
    evidenceRows: [evidenceRow()],
  });
}

describe('CTE-1 resolver — KCRE11 golden fixture (PART AB)', () => {
  it('resolves 300/180/120 to COMPLETE_WITH_VERIFIED_EVIDENCE with exact cost', () => {
    const res = resolveTaxCost(kcre11Input());
    expect(res.status).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(res.positionQuantity).toBe('300');
    expect(res.ledgerKnownQuantity).toBe('180');
    expect(res.evidenceKnownQuantity).toBe('120');
    expect(res.coveredQuantity).toBe('300');
    expect(res.uncoveredQuantity).toBe('0');
    expect(res.resolvedCost).toBe('2494.96');
    expect(res.currency).toBe('BRL');
    // 2494.96 / 300 full-precision average (Decimal 40 digits).
    expect(res.resolvedAverageCost).toBe(`8.3165${'3'.repeat(35)}`);
    expect(res.lots).toHaveLength(4);
    expect(res.lots.filter((l) => l.sourceKind === 'LEDGER')).toHaveLength(3);
    const evLot = res.lots.find((l) => l.sourceKind === 'VERIFIED_EVIDENCE')!;
    expect(evLot.evidenceId).toBe('ev-1');
    expect(evLot.evidenceVersion).toBe(1);
    expect(evLot.evidenceFingerprint).toBe('f'.repeat(64));
    expect(res.issues).toEqual([]);
  });

  it('derives a missing cost side exactly (unit-only evidence)', () => {
    const res = resolveTaxCost(
      input({
        positionQuantity: '120',
        ledgerLots: [],
        evidenceRows: [evidenceRow({ unitCost: '8.50', totalCost: undefined })],
      }),
    );
    expect(res.status).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(res.resolvedCost).toBe('1020');
  });
});

describe('CTE-1 resolver — coverage states', () => {
  it('PART AC: ledger-only full coverage → COMPLETE_LEDGER_ONLY', () => {
    const res = resolveTaxCost(
      input({
        positionQuantity: '100',
        ledgerLots: [ledgerLot({ transactionId: 'tx-1', quantity: '100', unitCost: '10.00', totalCost: '1000.00', acquisitionDate: '2025-01-10' })],
        evidenceRows: [],
      }),
    );
    expect(res.status).toBe('COMPLETE_LEDGER_ONLY');
    expect(res.resolvedCost).toBe('1000');
    expect(res.resolvedAverageCost).toBe('10');
    expect(res.sources).toEqual([{ kind: 'LEDGER', label: '1 ledger lot(s)' }]);
  });

  it('PART AD: partial coverage stays PARTIAL without full average', () => {
    const res = resolveTaxCost(
      input({
        positionQuantity: '100',
        ledgerLots: [ledgerLot({ transactionId: 'tx-1', quantity: '40', unitCost: '10.00', totalCost: '400.00', acquisitionDate: '2025-01-10' })],
        evidenceRows: [evidenceRow({ quantityCovered: '30', unitCost: '10.00', totalCost: '300.00' })],
      }),
    );
    expect(res.status).toBe('PARTIAL');
    expect(res.coveredQuantity).toBe('70');
    expect(res.uncoveredQuantity).toBe('30');
    expect(res.resolvedCost).toBe('700');
    expect(res.resolvedAverageCost).toBeNull();
  });

  it('PART Q: zero position quantity → UNKNOWN, never COMPLETE', () => {
    const res = resolveTaxCost(input({ positionQuantity: '0' }));
    expect(res.status).toBe('UNKNOWN');
    expect(res.resolvedCost).toBeNull();
    expect(res.issues.some((i) => i.code === 'UNKNOWN_POSITION_QUANTITY')).toBe(true);
  });
});

describe('CTE-1 resolver — negative cases (PART AE)', () => {
  const base = () =>
    input({
      positionQuantity: '300',
      ledgerLots: [ledgerLot({ quantity: '180', unitCost: '8.00', totalCost: '1440.00', acquisitionDate: '2025-01-10' })],
    });

  it('1. over-coverage → BLOCKED without clamping', () => {
    const res = resolveTaxCost({ ...base(), evidenceRows: [evidenceRow({ quantityCovered: '500', unitCost: '8.50', totalCost: '4250.00' })] });
    expect(res.status).toBe('BLOCKED');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_OVER_COVERAGE')).toBe(true);
    expect(res.resolvedCost).toBeNull();
    expect(res.lots).toEqual([]);
  });

  it('2. evidence overlapping an exact-cost ledger lot → REDUNDANT, ledger wins', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [evidenceRow({ acquisitionDate: '2025-01-10', quantityCovered: '180', unitCost: '8.00', totalCost: '1440.00' })],
    });
    // Redundant evidence excluded; ledger still covers only 180 of 300 → PARTIAL.
    expect(res.status).toBe('PARTIAL');
    expect(res.evidenceKnownQuantity).toBe('0');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_REDUNDANT')).toBe(true);
  });

  it('3. conflicting evidence costs → BLOCKED, no arbitrary winner', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [
        evidenceRow({ evidenceId: 'ev-a', quantityCovered: '60', unitCost: '8.50', totalCost: '510.00' }),
        evidenceRow({ evidenceId: 'ev-b', evidenceFingerprint: 'e'.repeat(64), quantityCovered: '60', unitCost: '9.00', totalCost: '540.00' }),
      ],
    });
    expect(res.status).toBe('BLOCKED');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_CONFLICT')).toBe(true);
  });

  it('4. superseded VERIFIED evidence does not contribute', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [
        evidenceRow({ evidenceId: 'ev-old', evidenceVersion: 1 }),
        evidenceRow({ evidenceId: 'ev-new', evidenceVersion: 2, supersedesId: 'ev-old' }),
      ],
    });
    // ev-old superseded (NOT_CURRENT); ev-new counts 120 → covered 300 → COMPLETE.
    expect(res.status).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(res.evidenceKnownQuantity).toBe('120');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_NOT_CURRENT')).toBe(true);
    expect(res.lots.filter((l) => l.sourceKind === 'VERIFIED_EVIDENCE')).toHaveLength(1);
  });

  it('5. REJECTED current version contributes nothing (no fallback)', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [evidenceRow({ status: 'REJECTED' })],
    });
    expect(res.status).toBe('PARTIAL');
    expect(res.evidenceKnownQuantity).toBe('0');
  });

  it('6. currency mismatch → BLOCKED', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [evidenceRow({ currency: 'USD', unitCost: '1.70', totalCost: '204.00' })],
    });
    expect(res.status).toBe('BLOCKED');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_CURRENCY_MISMATCH')).toBe(true);
  });

  it('7. missing acquisition date → excluded with blocking issue', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [evidenceRow({ acquisitionDate: null })],
    });
    expect(res.status).toBe('PARTIAL');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_MISSING_ACQUISITION_DATE')).toBe(true);
  });

  it('8. evidence after asOfDate → temporally invalid', () => {
    const res = resolveTaxCost({
      ...base(),
      asOfDate: '2024-12-20',
      evidenceRows: [evidenceRow()],
    });
    expect(res.status).toBe('PARTIAL');
    expect(res.evidenceKnownQuantity).toBe('0');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_TEMPORALLY_INVALID')).toBe(true);
  });

  it('9. account mismatch → row ignored', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [evidenceRow({ accountId: '99999999-9999-4999-8999-999999999999' })],
    });
    expect(res.evidenceKnownQuantity).toBe('0');
    expect(res.status).toBe('PARTIAL');
  });

  it('10. asset mismatch → row ignored', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [evidenceRow({ assetId: '99999999-9999-4999-8999-999999999999' })],
    });
    expect(res.evidenceKnownQuantity).toBe('0');
  });

  it('11. duplicate economics across documents counted once', () => {
    const res = resolveTaxCost({
      ...base(),
      evidenceRows: [
        evidenceRow({ evidenceId: 'ev-a' }),
        evidenceRow({ evidenceId: 'ev-b', evidenceFingerprint: 'e'.repeat(64) }),
      ],
    });
    expect(res.evidenceKnownQuantity).toBe('120');
    expect(res.issues.some((i) => i.code === 'EVIDENCE_DUPLICATE')).toBe(true);
  });

  it('12/13. zero/negative quantities rejected', () => {
    expect(() => resolveTaxCost(input({ positionQuantity: '-5' }))).not.toThrow();
    const neg = resolveTaxCost(input({ positionQuantity: '-5' }));
    expect(neg.status).toBe('UNKNOWN');
    const zeroEv = resolveTaxCost({ ...base(), evidenceRows: [evidenceRow({ quantityCovered: '0' })] });
    expect(zeroEv.status).toBe('PARTIAL');
    expect(zeroEv.issues.some((i) => i.code === 'INVALID_LOT_INPUT')).toBe(true);
  });

  it('14. unknown position model stays UNKNOWN', () => {
    const res = resolveTaxCost(input({ positionQuantity: '0', ledgerLots: [], evidenceRows: [evidenceRow()] }));
    expect(res.status).toBe('UNKNOWN');
  });

  it('16. conflict never COMPLETE even at full nominal coverage', () => {
    const res = resolveTaxCost(input({
      positionQuantity: '120',
      ledgerLots: [],
      evidenceRows: [
        evidenceRow({ evidenceId: 'ev-a', quantityCovered: '120', unitCost: '8.50', totalCost: '1020.00' }),
        evidenceRow({ evidenceId: 'ev-b', evidenceFingerprint: 'e'.repeat(64), quantityCovered: '120', unitCost: '9.00', totalCost: '1080.00' }),
      ],
    }));
    expect(res.status).toBe('BLOCKED');
  });
});

describe('CTE-1 resolver — revision chains (PART AF/AG)', () => {
  const chainBase = () =>
    input({
      positionQuantity: '300',
      ledgerLots: [ledgerLot({ quantity: '180', unitCost: '8.00', totalCost: '1440.00', acquisitionDate: '2025-01-10' })],
    });

  it('v1 VERIFIED superseded by v2 REVIEW_REQUIRED → neither contributes', () => {
    const res = resolveTaxCost({
      ...chainBase(),
      evidenceRows: [
        evidenceRow({ evidenceId: 'ev-1', evidenceVersion: 1 }),
        evidenceRow({ evidenceId: 'ev-2', evidenceVersion: 2, status: 'REVIEW_REQUIRED', supersedesId: 'ev-1' }),
      ],
    });
    expect(res.evidenceKnownQuantity).toBe('0');
    expect(res.status).toBe('PARTIAL');
  });

  it('v3 VERIFIED supersedes v2 → only v3 contributes', () => {
    const res = resolveTaxCost({
      ...chainBase(),
      evidenceRows: [
        evidenceRow({ evidenceId: 'ev-1', evidenceVersion: 1 }),
        evidenceRow({ evidenceId: 'ev-2', evidenceVersion: 2, status: 'REVIEW_REQUIRED', supersedesId: 'ev-1' }),
        evidenceRow({ evidenceId: 'ev-3', evidenceVersion: 3, supersedesId: 'ev-2' }),
      ],
    });
    expect(res.status).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(res.lots.filter((l) => l.sourceKind === 'VERIFIED_EVIDENCE').map((l) => l.evidenceId)).toEqual(['ev-3']);
  });
});

describe('CTE-1 resolver — purity boundaries (PART AI/AJ)', () => {
  it('does not import tax-engine calculation code', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/tax-intelligence/src/resolution.ts'), 'utf8');
    expect(source).not.toMatch(/@atlas\/tax-engine/);
    expect(source).not.toMatch(/from ['"]\.\.\/.*tax-engine/);
  });

  it('does not import Prisma, repositories or database clients', () => {
    for (const file of ['resolution.ts', 'coverage.ts', 'projector.ts', 'types.ts', 'blocker-catalog.ts']) {
      const source = fs.readFileSync(path.join(process.cwd(), 'packages/tax-intelligence/src', file), 'utf8');
      expect(source, file).not.toMatch(/@prisma\/client|@atlas\/database|PrismaClient/);
    }
  });

  it('rejects missing scope identity without computing', () => {
    expect(() => resolveTaxCost(input({ portfolioId: '  ' }))).toThrow(InvalidTaxCostResolutionInput);
  });
});
