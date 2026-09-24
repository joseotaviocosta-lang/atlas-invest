import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: Performance Engine Boundaries', () => {
  it('performance-engine does not import market-data adapter', () => {
    const c = read('packages/performance-engine/src/index.ts');
    expect(c).not.toMatch(/@atlas\/market-data/);
    expect(c).not.toMatch(/Stooq/);
    expect(c).not.toMatch(/Yahoo/);
  });

  it('performance-engine does not import portfolio-engine internals', () => {
    const c = read('packages/performance-engine/src/index.ts');
    expect(c).not.toMatch(/@atlas\/portfolio-engine/);
    expect(c).not.toMatch(/replayPortfolio/);
  });

  it('performance-engine does not import API, database, UI', () => {
    const c = read('packages/performance-engine/src/index.ts');
    expect(c).not.toMatch(/@nestjs/);
    expect(c).not.toMatch(/@prisma/);
    expect(c).not.toMatch(/from 'react'/);
    expect(c).not.toMatch(/@atlas\/database/);
  });

  it('portfolio-engine does not import performance-engine', () => {
    const files = [
      'packages/portfolio-engine/src/engine.ts',
      'packages/portfolio-engine/src/index.ts',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/performance-engine/);
      expect(c).not.toMatch(/calculateTWR/);
      expect(c).not.toMatch(/calculateXIRR/);
    }
  });

  it('valuation-engine unchanged (no performance import)', () => {
    const c = read('packages/valuation-engine/src/index.ts');
    expect(c).not.toMatch(/performance-engine/);
    expect(c).not.toMatch(/calculateTWR/);
  });
});
