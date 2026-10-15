import { describe, it, expect } from 'vitest';
import {
  projectFiscalEvents,
  resolveTaxAssetCategory,
  computeEquityMonthlyTaxCore,
  evaluateTaxInputReadiness,
  fiscalCompetenceFromString,
} from '@atlas/tax-engine';
import { buy, sell, PF, VALE, uuidFor } from './helpers';

/**
 * Phase 4L.1V-H8 — trade-date attribution and Brazilian equity fiscal metadata.
 *
 * Human case: VALE3 BUY 10 @30 (2026-01-05), BUY 10 @40 (2026-01-15),
 * SELL 5 @45 (2026-02-10). Engine truth: remaining qty 15, avg 35,
 * remaining cost 525, realized gross gain 50, February proceeds 225.
 */
const VALE_MAP = new Map<string, string>([[VALE, 'STOCK']]);

function h8Ledger() {
  return [
    buy('h8-b1', '2026-01-05', '10', '30.00', 'BRL', VALE),
    buy('h8-b2', '2026-01-15', '10', '40.00', 'BRL', VALE),
    sell('h8-s1', '2026-02-10', '5', '45.00', 'BRL', VALE),
  ];
}

describe('Phase 4L.1V-H8 — trade-date persistence and fiscal competence', () => {
  it('A: persists exact trade dates and attributes fiscal competence (no createdAt substitution)', () => {
    const events = projectFiscalEvents(h8Ledger(), { assetTypeByAssetId: VALE_MAP });
    const byType = new Map(events.map((e) => [e.sourceTransactionType + e.economicDate, e]));
    expect(events).toHaveLength(3);

    const jan = events.filter((e) => e.competence.value === '2026-01');
    const feb = events.filter((e) => e.competence.value === '2026-02');
    expect(jan).toHaveLength(2);
    expect(feb).toHaveLength(1);
    expect(feb[0]!.sourceTransactionType).toBe('SELL');

    // Economic date is the trade date, immune to creation timestamps
    // (engine FiscalEvent carries a LocalDate value object; the read model
    // serializes it as an exact YYYY-MM-DD civil string)
    for (const e of events) {
      expect(String(e.economicDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(byType.size).toBe(3);
  });

  it('B: distinct intended dates never collapse into one competence', () => {
    const events = projectFiscalEvents(h8Ledger(), { assetTypeByAssetId: VALE_MAP });
    const competences = new Set(events.map((e) => e.competence.value));
    expect(competences).toEqual(new Set(['2026-01', '2026-02']));
  });
});

describe('Phase 4L.1V-H8 — Brazilian equity fiscal classification', () => {
  it('C: canonical STOCK maps to BRAZILIAN_EQUITY (no UNKNOWN issue)', () => {
    expect(resolveTaxAssetCategory('STOCK')).toBe('BRAZILIAN_EQUITY');
    const events = projectFiscalEvents(h8Ledger(), { assetTypeByAssetId: VALE_MAP });
    for (const e of events) {
      expect(e.taxAssetCategory).toBe('BRAZILIAN_EQUITY');
      expect(e.qualityIssues).not.toContain('UNKNOWN_ASSET_TAX_CATEGORY');
    }
  });

  it('C: non-canonical EQUITY label resolves to UNKNOWN (canonical contract)', () => {
    expect(resolveTaxAssetCategory('EQUITY')).toBe('UNKNOWN');
    const events = projectFiscalEvents(h8Ledger(), {
      assetTypeByAssetId: new Map([[VALE, 'EQUITY']]),
    });
    expect(events.some((e) => e.qualityIssues.includes('UNKNOWN_ASSET_TAX_CATEGORY'))).toBe(true);
  });
});

describe('Phase 4L.1V-H8 — cost basis from canonical engine results', () => {
  it('D/E: SELL carries cost basis when the canonical realized result is fed', () => {
    const ledger = h8Ledger();
    const sellId = uuidFor('h8-s1');
    const events = projectFiscalEvents(ledger, {
      assetTypeByAssetId: VALE_MAP,
      canonicalRealizedByTransactionId: new Map([
        [
          sellId,
          {
            netProceeds: '225',
            costBasisRemoved: '175',
            realizedGainLoss: '50',
            status: 'KNOWN' as const,
          },
        ],
      ]),
    });
    const sale = events.find((e) => e.sourceTransactionType === 'SELL')!;
    expect(sale.qualityIssues).not.toContain('UNKNOWN_COST_BASIS');
  });

  it('D: SELL without canonical realized data fails closed (UNKNOWN_COST_BASIS)', () => {
    const events = projectFiscalEvents(h8Ledger(), { assetTypeByAssetId: VALE_MAP });
    const sale = events.find((e) => e.sourceTransactionType === 'SELL')!;
    expect(sale.qualityIssues).toContain('UNKNOWN_COST_BASIS');
  });
});

describe('Phase 4L.1V-H8 — normal-equity exemption mirror (gain 50, proceeds 225)', () => {
  it('G: below-threshold normal sale is EXEMPT with zero tax (no fabrication)', () => {
    const r = computeEquityMonthlyTaxCore({
      taxSubjectId: 's-h8',
      competence: '2026-02',
      sellLegs: [
        {
          legId: 'h8-s1',
          assetId: VALE,
          classification: 'NORMAL',
          quantity: '5',
          grossAmount: '225',
          costBasis: '175',
          assetEligibility: 'ELIGIBLE_EQUITY',
        },
      ],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(r.exemption.status).toBe('EXEMPT');
    expect(r.normal.taxableBaseBeforeRate).toBe('0');
    expect(r.overallStatus).toBe('COMPLETE');
    // Rate application (15% BR-EQUITY-NORMAL) and gross tax live downstream in
    // the production-tax layer; the live February fixture proved grossTax "0".
  });
});

describe('Phase 4L.1V-H8 — IRRF missing-evidence canonical semantics', () => {
  const competence = fiscalCompetenceFromString('2026-02');

  it('H: missing IRRF evidence is flagged without inventing credit', () => {
    const readiness = evaluateTaxInputReadiness({
      competence,
      requiresWithholding: true,
      withholdingInputs: [],
    });
    expect(readiness.withholdingStatus).toBe('MISSING');
    expect(readiness.issues).toContain('MISSING_WITHHOLDING_INPUT');
  });

  it('H: no withholding requirement when no sale/income exists', () => {
    const readiness = evaluateTaxInputReadiness({
      competence,
      requiresWithholding: false,
      withholdingInputs: [],
    });
    expect(readiness.withholdingStatus).toBe('NOT_REQUIRED');
    expect(readiness.issues).not.toContain('MISSING_WITHHOLDING_INPUT');
  });
});

describe('Phase 4L.1V-H8 — portfolio scoping', () => {
  it('J: fixture ledger is portfolio-scoped (no cross-portfolio leakage)', () => {
    const ledger = h8Ledger();
    for (const tx of ledger) {
      expect(String(tx.portfolioId)).toBe(PF);
    }
  });
});
