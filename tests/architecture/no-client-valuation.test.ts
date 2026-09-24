import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const WEB_PORTFOLIO = 'apps/web/src/app/(app)/portfolio/page.tsx';
const WEB_POSITION = 'apps/web/src/components/portfolio/PositionRow.tsx';
const MOBILE_PORTFOLIO = 'apps/mobile/app/(app)/(tabs)/portfolio.tsx';

function read(p: string): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  } catch {
    return '';
  }
}

describe('Architecture: No Client-Side Valuation Math', () => {
  it('web portfolio page never does quantity * price', () => {
    const c = read(WEB_PORTFOLIO);
    expect(c).not.toMatch(/quantity\s*\*\s*price/);
    expect(c).not.toMatch(/parseFloat.*price/);
    expect(c).not.toMatch(/Number\(.*price/);
  });

  it('web PositionRow never calculates marketValue', () => {
    const c = read(WEB_POSITION);
    // Should not contain multiplication for market value
    expect(c).not.toMatch(/quantity\s*\*\s*price/);
    // Should use valuation prop, not compute
    expect(c).toContain('valuation');
  });

  it('mobile portfolio never does client math', () => {
    const c = read(MOBILE_PORTFOLIO);
    expect(c).not.toMatch(/quantity\s*\*\s*price/);
  });

  it('valuation engine is pure and frozen', async () => {
    const { valuePosition } = await import('@atlas/valuation-engine');
    const pos = {
      assetId: '11111111-1111-4111-8111-111111111111',
      accountId: 'acc1',
      quantity: '10',
      currency: 'BRL' as never,
      totalCost: '100.00',
      averageCost: '10.00',
      costBasisStatus: 'KNOWN' as const,
    };
    const quote = {
      assetId: '11111111-1111-4111-8111-111111111111',
      price: '15.00',
      currency: 'BRL' as never,
      asOf: '2026-09-15T15:30:00Z',
      receivedAt: '2026-09-15T15:31:00Z',
      source: 'IN_MEMORY',
      status: 'LIVE' as never,
      freshness: 'FRESH' as never,
      providerSymbol: 'PETR4.SA',
    };
    const v = valuePosition(pos, quote);
    expect(Object.isFrozen(v)).toBe(true);
    expect(v.marketValue?.amount).toBe('150');
  });

  it('valuation uses exact decimal, not float', async () => {
    const c = fs.readFileSync(
      path.join(process.cwd(), 'packages/valuation-engine/src/index.ts'),
      'utf8',
    );
    expect(c).not.toMatch(/parseFloat/);
    expect(c).not.toMatch(/Number\(.*price/);
    expect(c).toContain('Money');
    expect(c).toContain('Quantity');
  });
});
