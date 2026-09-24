import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: No Client Performance Math', () => {
  it('web performance page does not calculate TWR/XIRR', () => {
    const c = read('apps/web/src/app/(app)/portfolio/performance/page.tsx');
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/calculateXIRR/);
    expect(c).not.toMatch(/quantity \* price/);
  });

  it('mobile performance does not calculate TWR', () => {
    const c = read('apps/mobile/app/(app)/portfolio/performance.tsx');
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/Math\.pow/);
  });

  it('view model does not calculate performance', () => {
    const c = read('packages/ui/src/view-models/portfolio-performance.view-model.ts');
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/reduce.*twr/i);
  });

  it('no client annualization', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/annualize/i);
      expect(c).not.toMatch(/\* 100.*365/);
    }
  });

  it('no cross-currency combine', () => {
    const c = read('packages/ui/src/view-models/portfolio-performance.view-model.ts');
    expect(c).not.toMatch(/BRL.*\+.*USD/);
    expect(c).not.toMatch(/currencies.*\+/);
  });

  it('guards for parseFloat/Number in performance client files', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
    ];
    for (const f of files) {
      const c = read(f);
      // Allow formatPercentage which internally may use Number, but not direct financial math
      expect(c).not.toMatch(/parseFloat.*twr/i);
      expect(c).not.toMatch(/Number\(.*twr/i);
    }
  });
});
