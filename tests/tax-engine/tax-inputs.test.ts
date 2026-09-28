import { describe, expect, it } from 'vitest';
import { LocalDate, Money } from '@atlas/domain';
import {
  evaluateTaxInputReadiness,
  fiscalCompetenceFromString,
  type FiiTaxEligibilityFacts,
  type TaxTradeClassification,
  type TaxWithholdingInput,
} from '@atlas/tax-engine';

const competence = fiscalCompetenceFromString('2026-09');

const trade = (id: string): TaxTradeClassification => ({
  transactionId: id,
  classification: 'NORMAL',
  source: 'BROKER_IMPORT',
  sourceReference: `note-${id}`,
  classificationVersion: 'trade-classification-v1',
});

const wh = (id: string): TaxWithholdingInput => ({
  id,
  sourceReference: `wh-${id}`,
  sourceType: 'BROKER_IMPORT',
  economicDate: LocalDate.from('2026-09-10'),
  competence,
  category: 'BRAZILIAN_EQUITY',
  currency: 'BRL',
  amount: Money.from('1.00', 'BRL'),
  status: 'CONFIRMED',
  provenance: { source: 'BROKER_IMPORT', sourceReference: `wh-${id}` },
});

const fii = (): FiiTaxEligibilityFacts => ({
  assetId: 'fii-1',
  asOfDate: LocalDate.from('2026-09-01'),
  holderCount: 500,
  investorOwnershipPercent: '1',
  isExchangeTraded: true,
  source: 'OFFICIAL_FUND_DATA',
  status: 'KNOWN',
  provenance: { source: 'OFFICIAL_FUND_DATA', sourceReference: 'fund-1' },
});

describe('Phase 4B.2 — tax input readiness', () => {
  it('is NOT_REQUIRED overall when no inputs are needed', () => {
    const r = evaluateTaxInputReadiness({ competence });
    expect(r.tradeClassificationStatus).toBe('NOT_REQUIRED');
    expect(r.withholdingStatus).toBe('NOT_REQUIRED');
    expect(r.fiiMetadataStatus).toBe('NOT_REQUIRED');
    expect(r.issues).toEqual([]);
  });

  it('combines trade, withholding and FII readiness', () => {
    const r = evaluateTaxInputReadiness({
      competence,
      requiredTradeClassificationTransactionIds: ['a', 'b'],
      tradeClassifications: [trade('a'), trade('b')],
      requiresWithholding: true,
      withholdingInputs: [wh('1')],
      requiresFiiMetadata: true,
      fiiFacts: [fii()],
      asOfDate: LocalDate.from('2026-09-30'),
      fiiStalenessDays: 30,
    });
    expect(r.tradeClassificationStatus).toBe('COMPLETE');
    expect(r.withholdingStatus).toBe('COMPLETE');
    expect(r.fiiMetadataStatus).toBe('COMPLETE');
    expect(r.capabilities).toEqual({
      tradeClassificationComplete: true,
      withholdingComplete: true,
      fiiMetadataComplete: true,
    });
  });

  it('aggregates, dedupes and sorts provenance references', () => {
    const r = evaluateTaxInputReadiness({
      competence,
      requiredTradeClassificationTransactionIds: ['a'],
      tradeClassifications: [trade('a')],
      requiresWithholding: true,
      withholdingInputs: [wh('1'), { ...wh('2'), sourceReference: 'wh-1' }],
    });
    expect(r.provenanceReferences).toEqual(['note-a', 'wh-1']);
  });

  it('produces unique, sorted issues', () => {
    const r = evaluateTaxInputReadiness({
      competence,
      requiredTradeClassificationTransactionIds: ['a'],
      tradeClassifications: [],
      requiresWithholding: true,
      withholdingInputs: [],
      requiresFiiMetadata: true,
      fiiFacts: [],
    });
    expect(r.issues).toEqual([...r.issues].sort());
    expect(new Set(r.issues).size).toBe(r.issues.length);
    expect(r.issues).toContain('UNKNOWN_TRADE_CLASSIFICATION');
    expect(r.issues).toContain('MISSING_WITHHOLDING_INPUT');
    expect(r.issues).toContain('MISSING_FII_ELIGIBILITY_METADATA');
  });

  it('contains no tax arithmetic or legal constants', () => {
    const r = evaluateTaxInputReadiness({ competence });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/parseFloat|Math\.|rate|threshold|taxDue|imposto/i);
  });

  it('assembles readiness for 10 / 100 / 1000 / 10000 classifications in bounded time', () => {
    for (const n of [10, 100, 1000, 10000]) {
      const ids = Array.from({ length: n }, (_, i) => `tx-${i}`);
      const classifications: TaxTradeClassification[] = ids.map((id) => ({
        transactionId: id,
        classification: 'NORMAL',
        source: 'BROKER_IMPORT',
        sourceReference: `note-${id}`,
        classificationVersion: 'trade-classification-v1',
      }));
      const start = Date.now();
      const r = evaluateTaxInputReadiness({
        competence,
        requiredTradeClassificationTransactionIds: ids,
        tradeClassifications: classifications,
      });
      const elapsed = Date.now() - start;
      expect(r.classificationCoverage).toEqual({ required: n, classified: n, unknown: 0 });
      expect(elapsed).toBeLessThan(5000);
    }
  });
});
