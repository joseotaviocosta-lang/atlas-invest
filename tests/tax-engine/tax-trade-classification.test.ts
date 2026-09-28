import { describe, expect, it } from 'vitest';
import {
  evaluateTaxInputReadiness,
  fiscalCompetenceFromString,
  validateTaxTradeClassification,
  type TaxTradeClassification,
} from '@atlas/tax-engine';

const classification = (over: Partial<TaxTradeClassification> = {}): TaxTradeClassification => ({
  transactionId: 'tx-1',
  classification: 'NORMAL',
  source: 'BROKER_IMPORT',
  sourceReference: 'broker-note-1',
  classificationVersion: 'trade-classification-v1',
  ...over,
});

describe('Phase 4B.2 — canonical trade classification', () => {
  it('accepts a concrete classification only with provenance', () => {
    expect(validateTaxTradeClassification(classification()).valid).toBe(true);
    const noRef = classification({ sourceReference: undefined });
    expect(validateTaxTradeClassification(noRef).valid).toBe(false);
    expect(validateTaxTradeClassification(noRef).errors.join(' ')).toMatch(/sourceReference/);
  });

  it('accepts UNKNOWN without provenance (unknown stays unknown)', () => {
    const result = validateTaxTradeClassification(
      classification({
        classification: 'UNKNOWN',
        source: 'CANONICAL_LEDGER',
        sourceReference: undefined,
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects unknown enum values', () => {
    expect(
      validateTaxTradeClassification(classification({ classification: 'DAYTRADE' as never })).valid,
    ).toBe(false);
    expect(validateTaxTradeClassification(classification({ source: 'GUESS' as never })).valid).toBe(
      false,
    );
  });

  it('does NOT infer DAY_TRADE from same-day buy/sell (no heuristic)', () => {
    // The module performs no matching; without an explicit classification the
    // required transaction remains UNKNOWN.
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiredTradeClassificationTransactionIds: ['buy-1', 'sell-1'],
      tradeClassifications: [],
    });
    expect(readiness.tradeClassificationStatus).not.toBe('COMPLETE');
    expect(readiness.capabilities.tradeClassificationComplete).toBe(false);
    expect(readiness.issues).toContain('UNKNOWN_TRADE_CLASSIFICATION');
  });

  it('reports PARTIAL when only some required operations are classified', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiredTradeClassificationTransactionIds: ['a', 'b'],
      tradeClassifications: [classification({ transactionId: 'a' })],
    });
    expect(readiness.tradeClassificationStatus).toBe('PARTIAL');
    expect(readiness.classificationCoverage).toEqual({ required: 2, classified: 1, unknown: 1 });
  });

  it('reports COMPLETE when all required operations are classified', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiredTradeClassificationTransactionIds: ['a', 'b'],
      tradeClassifications: [
        classification({ transactionId: 'a', classification: 'NORMAL' }),
        classification({ transactionId: 'b', classification: 'DAY_TRADE' }),
      ],
    });
    expect(readiness.tradeClassificationStatus).toBe('COMPLETE');
    expect(readiness.capabilities.tradeClassificationComplete).toBe(true);
  });

  it('treats UNKNOWN classification as not classified', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiredTradeClassificationTransactionIds: ['a'],
      tradeClassifications: [
        classification({
          transactionId: 'a',
          classification: 'UNKNOWN',
          sourceReference: undefined,
        }),
      ],
    });
    expect(readiness.tradeClassificationStatus).toBe('UNKNOWN');
    expect(readiness.issues).toContain('UNKNOWN_TRADE_CLASSIFICATION');
  });
});
