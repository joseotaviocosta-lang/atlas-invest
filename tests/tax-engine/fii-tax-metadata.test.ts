import { describe, expect, it } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  evaluateTaxInputReadiness,
  fiscalCompetenceFromString,
  isValidOwnershipPercent,
  validateFiiTaxEligibilityFacts,
  type FiiTaxEligibilityFacts,
} from '@atlas/tax-engine';

const facts = (over: Partial<FiiTaxEligibilityFacts> = {}): FiiTaxEligibilityFacts => ({
  assetId: 'asset-fii-1',
  asOfDate: LocalDate.from('2026-09-01'),
  holderCount: 1200,
  investorOwnershipPercent: '2.5',
  isExchangeTraded: true,
  source: 'OFFICIAL_FUND_DATA',
  status: 'KNOWN',
  provenance: { source: 'OFFICIAL_FUND_DATA', sourceReference: 'fund-report-2026-09' },
  ...over,
});

describe('Phase 4B.2 — FII tax-condition metadata (factual input)', () => {
  it('accepts fully known facts', () => {
    expect(validateFiiTaxEligibilityFacts(facts()).valid).toBe(true);
  });

  it('requires all fields for KNOWN status', () => {
    expect(validateFiiTaxEligibilityFacts(facts({ holderCount: undefined })).valid).toBe(false);
    expect(
      validateFiiTaxEligibilityFacts(facts({ investorOwnershipPercent: undefined })).valid,
    ).toBe(false);
    expect(validateFiiTaxEligibilityFacts(facts({ isExchangeTraded: undefined })).valid).toBe(
      false,
    );
  });

  it('forbids guessed values for UNKNOWN status', () => {
    const result = validateFiiTaxEligibilityFacts(
      facts({
        status: 'UNKNOWN',
        holderCount: 0,
        investorOwnershipPercent: '0',
        isExchangeTraded: false,
      }),
    );
    expect(result.valid).toBe(false);
    const clean = validateFiiTaxEligibilityFacts(
      facts({
        status: 'UNKNOWN',
        holderCount: undefined,
        investorOwnershipPercent: undefined,
        isExchangeTraded: undefined,
      }),
    );
    expect(clean.valid).toBe(true);
  });

  it('validates holderCount and ownership percent', () => {
    expect(validateFiiTaxEligibilityFacts(facts({ holderCount: -1 })).valid).toBe(false);
    expect(validateFiiTaxEligibilityFacts(facts({ holderCount: 1.5 })).valid).toBe(false);
    expect(validateFiiTaxEligibilityFacts(facts({ investorOwnershipPercent: '120' })).valid).toBe(
      false,
    );
    expect(isValidOwnershipPercent('3.999999999999999999')).toBe(true);
    expect(isValidOwnershipPercent('abc')).toBe(false);
  });

  it('preserves exact decimal ownership without mutation', () => {
    const result = validateFiiTaxEligibilityFacts(
      facts({ investorOwnershipPercent: '3.999999999999999999' }),
    );
    expect(result.valid).toBe(true);
  });

  it('reports MISSING when required but absent', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresFiiMetadata: true,
      fiiFacts: [],
    });
    expect(readiness.fiiMetadataStatus).toBe('MISSING');
    expect(readiness.issues).toContain('MISSING_FII_ELIGIBILITY_METADATA');
  });

  it('reports PARTIAL when metadata is UNKNOWN/PARTIAL', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresFiiMetadata: true,
      fiiFacts: [
        facts({
          status: 'UNKNOWN',
          holderCount: undefined,
          investorOwnershipPercent: undefined,
          isExchangeTraded: undefined,
        }),
      ],
    });
    expect(readiness.fiiMetadataStatus).toBe('PARTIAL');
    expect(readiness.issues).toContain('MISSING_FII_ELIGIBILITY_METADATA');
  });

  it('flags STALE metadata against the reference date', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresFiiMetadata: true,
      fiiFacts: [facts({ asOfDate: LocalDate.from('2026-01-01') })],
      asOfDate: LocalDate.from('2026-09-30'),
      fiiStalenessDays: 30,
    });
    expect(readiness.fiiMetadataStatus).toBe('PARTIAL');
    expect(readiness.issues).toContain('STALE_FII_ELIGIBILITY_METADATA');
  });

  it('reports COMPLETE for fresh known facts', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresFiiMetadata: true,
      fiiFacts: [facts()],
      asOfDate: LocalDate.from('2026-09-30'),
      fiiStalenessDays: 30,
    });
    expect(readiness.fiiMetadataStatus).toBe('COMPLETE');
    expect(readiness.capabilities.fiiMetadataComplete).toBe(true);
  });
});
