import { describe, expect, it } from 'vitest';
import {
  buildIssue,
  deriveQualityStatus,
  describeIssue,
  isDataQualityIssue,
  sortQualityIssues,
  unionCapabilities,
  type DataQualityIssue,
} from '@atlas/portfolio-strategy';

function issue(
  code: string,
  assetId: string | null = 'asset-1',
  ticker: string | null = 'PETR4',
): DataQualityIssue {
  const built = buildIssue({ code, assetId, ticker });
  if (!built) throw new Error(`expected issue for ${code}`);
  return built;
}

/**
 * Phase 5R-E — data quality engine (pure, zero I/O).
 *
 * Closed-world eligibility (limitation != issue), deterministic severity,
 * deduplicated single issue per root cause with explicit affected
 * capabilities, stable ordering and rule-based overall status. No scores.
 */
describe('Phase 5R-E: issue eligibility', () => {
  it('recognizes real data problems and nothing else', () => {
    for (const code of [
      'MISSING_PRICE',
      'STALE_PRICE',
      'INCOMPLETE_COST_BASIS',
      'NO_FX_TRANSLATION',
      'MIXED_CURRENCIES_WITHOUT_TRANSLATION',
      'RECONCILIATION_DIVERGENT',
      'RECONCILIATION_MISSING_LOCAL',
      'RECONCILIATION_MISSING_SOURCE',
      'RECONCILIATION_UNRESOLVED',
      'PENDING_INTEGRATION_REVIEW',
    ]) {
      expect(isDataQualityIssue(code)).toBe(true);
    }
  });

  it('excludes normal states, capability gaps and window caveats', () => {
    for (const code of [
      'NO_INCOME_IN_PERIOD',
      'NO_POSITION_IN_PERIOD',
      'NO_ACTIVITY',
      'NO_INCOME_HISTORY',
      'POSITION_PERFORMANCE_NOT_AVAILABLE',
      'POSITION_CONTRIBUTION_NOT_AVAILABLE',
      'MISSING_START_PRICE',
      'MISSING_END_PRICE',
      'MISSING_FLOW_PRICE',
      'STALE_END_PRICE',
      'INSUFFICIENT_HISTORY',
      'ISSUER_CLASSIFICATION_NOT_AVAILABLE',
      'SECTOR_CLASSIFICATION_NOT_AVAILABLE',
      'PARTIAL_PORTFOLIO_VALUATION',
      'BUY',
      '',
    ]) {
      expect(isDataQualityIssue(code)).toBe(false);
      expect(buildIssue({ code, assetId: 'a', ticker: 'T' })).toBeNull();
      expect(describeIssue(code)).toBeNull();
    }
  });
});

describe('Phase 5R-E: severity and affected capabilities', () => {
  it('blocks on missing price and incomplete cost basis', () => {
    expect(issue('MISSING_PRICE').severity).toBe('BLOCKING');
    expect(issue('INCOMPLETE_COST_BASIS').severity).toBe('BLOCKING');
    expect(issue('MISSING_PRICE').affectedCapabilities).toContain('VALUATION');
    expect(issue('MISSING_PRICE').affectedCapabilities).toContain('ALLOCATION');
    expect(issue('INCOMPLETE_COST_BASIS').affectedCapabilities).toEqual([
      'REALIZED_PNL',
      'UNREALIZED_PNL',
      'ECONOMIC_PNL',
    ]);
  });

  it('reviews stale, FX and reconciliation states without invalidating natives', () => {
    expect(issue('STALE_PRICE').severity).toBe('REVIEW');
    expect(issue('NO_FX_TRANSLATION').severity).toBe('REVIEW');
    expect(issue('RECONCILIATION_DIVERGENT').severity).toBe('REVIEW');
    expect(issue('PENDING_INTEGRATION_REVIEW').severity).toBe('REVIEW');
    // Stale price qualifies valuation; it never claims natives are wrong.
    expect(issue('STALE_PRICE').affectedCapabilities).toEqual(['VALUATION']);
    expect(issue('NO_FX_TRANSLATION').affectedCapabilities).toContain('REPORTING_VALUE');
  });

  it('routes navigation actions: positions to detail, portfolio rows to reviews', () => {
    expect(issue('MISSING_PRICE', 'asset-9', 'VALE3').actions).toEqual([
      { type: 'VIEW_POSITION', assetId: 'asset-9' },
    ]);
    expect(issue('RECONCILIATION_DIVERGENT', null, null).actions).toEqual([
      { type: 'VIEW_REVIEWS', assetId: null },
    ]);
  });
});

describe('Phase 5R-E: ordering and status', () => {
  it('orders by severity, domain, code and assetId deterministically', () => {
    const ordered = sortQualityIssues([
      issue('PENDING_INTEGRATION_REVIEW', null, null),
      issue('MISSING_PRICE', 'asset-b', 'B'),
      issue('STALE_PRICE', 'asset-a', 'A'),
      issue('MISSING_PRICE', 'asset-a', 'A'),
      issue('INCOMPLETE_COST_BASIS', 'asset-a', 'A'),
    ]);
    expect(ordered.map((row) => row.code)).toEqual([
      'MISSING_PRICE',
      'MISSING_PRICE',
      'INCOMPLETE_COST_BASIS',
      'STALE_PRICE',
      'PENDING_INTEGRATION_REVIEW',
    ]);
    expect(ordered[0]?.facts.assetId).toBe('asset-a');
    expect(ordered[1]?.facts.assetId).toBe('asset-b');
  });

  it('derives overall status from explicit rules without scores', () => {
    expect(deriveQualityStatus([])).toBe('COMPLETE');
    expect(deriveQualityStatus([issue('STALE_PRICE')])).toBe('REVIEW_REQUIRED');
    expect(deriveQualityStatus([issue('STALE_PRICE'), issue('MISSING_PRICE')])).toBe('BLOCKED');
    expect(deriveQualityStatus([issue('PENDING_INTEGRATION_REVIEW', null, null)])).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it('unions affected capabilities in canonical order', () => {
    expect(unionCapabilities([issue('STALE_PRICE'), issue('INCOMPLETE_COST_BASIS')])).toEqual([
      'VALUATION',
      'UNREALIZED_PNL',
      'REALIZED_PNL',
      'ECONOMIC_PNL',
    ]);
  });

  it('contains no score, forecast or advice math', () => {
    const source = [
      buildIssue.toString(),
      sortQualityIssues.toString(),
      deriveQualityStatus.toString(),
      unionCapabilities.toString(),
    ].join('\n');
    expect(source).not.toMatch(/score|forecast|yield|recommend|buy|sell/i);
    expect(source).not.toMatch(/parseFloat|\bNumber\(/);
  });
});
