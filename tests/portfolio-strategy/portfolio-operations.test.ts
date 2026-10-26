import { describe, expect, it } from 'vitest';
import {
  buildOperationsAttention,
  deriveOperationsStatus,
  previewAttention,
  sortOperationsAttention,
  type OperationsAttentionItem,
} from '@atlas/portfolio-strategy';

function item(
  code: string,
  domain: OperationsAttentionItem['domain'],
  severity: OperationsAttentionItem['severity'],
  source: string | null = null,
): OperationsAttentionItem {
  return {
    code,
    domain,
    severity,
    count: 1,
    facts: { source, assetId: null, at: null },
    actions: [{ type: 'VIEW_REVIEWS' }],
  };
}

function qualityIssue(code: string, severity: 'BLOCKING' | 'REVIEW', assetId: string) {
  return {
    code,
    domain: 'MARKET_DATA' as const,
    severity,
    affectedCapabilities: ['VALUATION' as const],
    facts: { assetId, ticker: 'T', asOf: null, count: null },
    actions: [{ type: 'VIEW_POSITION' as const, assetId }],
  };
}

/**
 * Phase 5S-A — operations center derivation (pure, zero I/O).
 *
 * Explicit eligibility only: failed/partial runs, reauth, pending
 * reviews, reconciliation problem states and grouped data-quality
 * issues. Normal states (clean runs, no connection, manual schedule,
 * preparing B3, matched reconciliation, clean data) produce nothing.
 * No scores, deterministic order and status.
 */
describe('Phase 5S-A: attention eligibility', () => {
  it('builds items from failed/partial runs, reauth, reviews, reconciliation and quality', () => {
    const items = buildOperationsAttention({
      latestRuns: [
        { source: 'B3', status: 'FAILED', at: '2026-10-01T00:00:00.000Z' },
        { source: 'CSV', status: 'PARTIAL', at: null },
        { source: 'MANUAL', status: 'COMPLETED', at: null },
      ],
      connections: [
        { source: 'B3', state: 'NEEDS_REAUTH' },
        { source: 'CSV', state: 'NOT_CONNECTED' },
      ],
      pendingReviews: 2,
      reconciliation: { divergent: 3, missingLocal: 0, missingSource: 1, unresolved: 0 },
      qualityIssues: [
        qualityIssue('MISSING_PRICE', 'BLOCKING', 'asset-1'),
        qualityIssue('MISSING_PRICE', 'BLOCKING', 'asset-2'),
        qualityIssue('STALE_PRICE', 'REVIEW', 'asset-3'),
      ],
    });
    const codes = items.map((row) => row.code);
    expect(codes).toContain('SYNC_FAILED');
    expect(codes).toContain('SYNC_PARTIAL');
    expect(codes).toContain('CONNECTION_NEEDS_REAUTH');
    expect(codes).toContain('PENDING_REVIEWS');
    expect(codes).toContain('RECONCILIATION_DIVERGENT');
    expect(codes).toContain('RECONCILIATION_MISSING_SOURCE');
    expect(codes).toContain('MISSING_PRICE');
    expect(codes).toContain('STALE_PRICE');
    // Dedupe: one item per root cause; quality grouped by code with counts.
    expect(codes.filter((code) => code === 'MISSING_PRICE')).toHaveLength(1);
    expect(items.find((row) => row.code === 'MISSING_PRICE')?.count).toBe(2);
    expect(items.find((row) => row.code === 'PENDING_REVIEWS')?.count).toBe(2);
    // Completed runs, unconnected sources and matched/zero states: nothing.
    expect(codes).not.toContain('RECONCILIATION_MISSING_LOCAL');
    expect(codes).not.toContain('RECONCILIATION_UNRESOLVED');
  });

  it('produces nothing for clear, unconfigured and preparing states', () => {
    expect(
      buildOperationsAttention({
        latestRuns: [{ source: 'B3', status: 'COMPLETED', at: null }],
        connections: [{ source: 'B3', state: 'NOT_CONNECTED' }],
        pendingReviews: 0,
        reconciliation: { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 },
        qualityIssues: [],
      }),
    ).toEqual([]);
    expect(
      buildOperationsAttention({
        latestRuns: [],
        connections: [{ source: 'B3', state: 'AUTHORIZED' }],
        pendingReviews: 0,
        reconciliation: { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 },
        qualityIssues: [],
      }),
    ).toEqual([]);
  });
});

describe('Phase 5S-A: ordering, status and preview', () => {
  it('orders by severity, domain, code and source deterministically', () => {
    const ordered = sortOperationsAttention([
      item('STALE_PRICE', 'DATA_QUALITY', 'REVIEW'),
      item('SYNC_FAILED', 'SYNC', 'REVIEW', 'B3'),
      item('MISSING_PRICE', 'DATA_QUALITY', 'BLOCKING'),
      item('PENDING_REVIEWS', 'RECONCILIATION', 'REVIEW'),
      item('SYNC_FAILED', 'SYNC', 'REVIEW', 'CSV'),
    ]);
    expect(ordered.map((row) => row.code)).toEqual([
      'MISSING_PRICE',
      'SYNC_FAILED',
      'SYNC_FAILED',
      'PENDING_REVIEWS',
      'STALE_PRICE',
    ]);
    expect(ordered[1]?.facts.source).toBe('B3');
    expect(ordered[2]?.facts.source).toBe('CSV');
  });

  it('derives status without scores: blocking data blocks, failures only require attention', () => {
    expect(deriveOperationsStatus([])).toBe('CLEAR');
    expect(deriveOperationsStatus([item('SYNC_FAILED', 'SYNC', 'REVIEW', 'B3')])).toBe(
      'ATTENTION_REQUIRED',
    );
    expect(
      deriveOperationsStatus([
        item('SYNC_FAILED', 'SYNC', 'REVIEW', 'B3'),
        item('MISSING_PRICE', 'DATA_QUALITY', 'BLOCKING'),
      ]),
    ).toBe('BLOCKED');
  });

  it('bounds attention preview with total count', () => {
    const items = [
      item('SYNC_FAILED', 'SYNC', 'REVIEW', 'B3'),
      item('PENDING_REVIEWS', 'RECONCILIATION', 'REVIEW'),
      item('STALE_PRICE', 'DATA_QUALITY', 'REVIEW'),
    ];
    expect(previewAttention(items, 2)).toEqual({ total: 3, preview: items.slice(0, 2) });
    expect(previewAttention(items, 10).preview).toHaveLength(3);
  });

  it('contains no score, forecast or advice math', () => {
    const source = [
      buildOperationsAttention.toString(),
      deriveOperationsStatus.toString(),
      previewAttention.toString(),
    ].join('\n');
    expect(source).not.toMatch(/score|forecast|yield|recommend|buy|sell/i);
    expect(source).not.toMatch(/parseFloat|\bNumber\(/);
  });
});
