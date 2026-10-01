import { describe, expect, it } from 'vitest';
import {
  COMPOSED_6015_CATEGORIES,
  compose6015,
  type Composed6015ComponentInput,
} from '@atlas/tax-engine';

function component(
  category: Composed6015ComponentInput['category'],
  netTax: string,
  overrides: Partial<Composed6015ComponentInput> = {},
): Composed6015ComponentInput {
  return {
    category,
    status: 'COMPLETE',
    netTax,
    currency: 'BRL',
    sourceFingerprint: `${category}:${netTax}`,
    ...overrides,
  };
}

describe('Phase 4G.2C — compose6015', () => {
  it('sums FII + normal + day trade into a single 6015 total', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [
        component('FII', '199.9'),
        component('EQUITY_NORMAL', '150'),
        component('EQUITY_DAY_TRADE', '200'),
      ],
    });
    expect(result.revenueCode).toBe('6015');
    expect(result.bucket).toBe('FII_SALE');
    expect(result.status).toBe('COMPLETE');
    expect(result.total).toBe('549.9');
    expect(result.components.map((c) => c.category)).toEqual([...COMPOSED_6015_CATEGORIES]);
  });

  it('treats missing categories as zero without changing the total', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [component('EQUITY_NORMAL', '150')],
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.total).toBe('150');
    expect(result.components.find((c) => c.category === 'FII')?.netCategoryTax).toBe('0');
    expect(result.components.find((c) => c.category === 'EQUITY_DAY_TRADE')?.netCategoryTax).toBe(
      '0',
    );
  });

  it('fails closed (BLOCKED) when any component is blocked and preserves no total', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [
        component('FII', '199.9'),
        component('EQUITY_NORMAL', '0', { status: 'BLOCKED' }),
      ],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.total).toBeNull();
    expect(result.reasonCode).toBe('COMPONENT_BLOCKED');
    expect(
      result.components.every((c) => c.netCategoryTax !== null || c.status !== 'COMPLETE'),
    ).toBe(true);
  });

  it('fails closed (PARTIAL) when any component is partial', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [component('EQUITY_DAY_TRADE', '0', { status: 'PARTIAL' })],
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.total).toBeNull();
    expect(result.reasonCode).toBe('COMPONENT_PARTIAL');
  });

  it('never lets a negative category reduce another category', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [component('FII', '199.9'), component('EQUITY_NORMAL', '-10')],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('NEGATIVE_COMPONENT');
    expect(result.total).toBeNull();
  });

  it('fails closed on a currency mismatch (no FX)', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [component('FII', '10', { currency: 'USD' })],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('CURRENCY_MISMATCH');
  });

  it('fails closed on unsupported activity outside the composed set', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [component('EQUITY_NORMAL', '150')],
      unsupportedActivity: true,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('UNSUPPORTED_ACTIVITY');
  });

  it('reports NO_ACTIVITY when all components are zero', () => {
    const result = compose6015({
      competence: '2026-09',
      components: [
        component('FII', '0'),
        component('EQUITY_NORMAL', '0'),
        component('EQUITY_DAY_TRADE', '0'),
      ],
    });
    expect(result.status).toBe('NO_ACTIVITY');
    expect(result.total).toBeNull();
    expect(result.components).toHaveLength(3);
  });

  it('is deterministic and order-independent (permutation invariant)', () => {
    const a = compose6015({
      competence: '2026-09',
      components: [
        component('EQUITY_DAY_TRADE', '200'),
        component('EQUITY_NORMAL', '150'),
        component('FII', '199.9'),
      ],
    });
    const b = compose6015({
      competence: '2026-09',
      components: [
        component('FII', '199.9'),
        component('EQUITY_NORMAL', '150'),
        component('EQUITY_DAY_TRADE', '200'),
      ],
    });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.total).toBe(b.total);
    expect(a.components.map((c) => c.category)).toEqual(b.components.map((c) => c.category));
  });

  it('changes the fingerprint when a source component changes', () => {
    const a = compose6015({
      competence: '2026-09',
      components: [component('EQUITY_NORMAL', '150')],
    });
    const b = compose6015({
      competence: '2026-09',
      components: [component('EQUITY_NORMAL', '160')],
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
