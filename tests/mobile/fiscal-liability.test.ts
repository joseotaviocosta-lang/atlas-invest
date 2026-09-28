import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';
const WEB_PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

describe('Mobile Fiscal tab — liability (Phase 4B)', () => {
  it('consumes the liability endpoint and shared view-model', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('/liability');
    expect(c).toContain('mapToMonthlyTaxLiabilityViewModel');
    expect(c).toContain('taxLiabilityQueryKey');
    expect(c).toContain('Como foi calculado');
  });

  it('performs no client-side tax math and exposes no invented tax due', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).not.toMatch(/parseFloat|Number\s*\(/);
    expect(c).not.toMatch(/Math\./);
    expect(c).not.toMatch(/taxDue\s*[=*+/]|ratePercentage\s*[=*+/]/);
  });
});

describe('Web Fiscal tab — liability (Phase 4B)', () => {
  it('renders liability, losses, withholding and trace without tax math', () => {
    const c = fs.readFileSync(path.join(process.cwd(), WEB_PAGE), 'utf8');
    expect(c).toContain('/liability');
    expect(c).toContain('mapToMonthlyTaxLiabilityViewModel');
    expect(c).toContain('Como foi calculado');
    expect(c).not.toMatch(/parseFloat|Number\s*\(/);
    expect(c).not.toMatch(/Math\./);
  });
});
