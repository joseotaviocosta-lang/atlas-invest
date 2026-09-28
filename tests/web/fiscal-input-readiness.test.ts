import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

describe('Web Fiscal tab — tax input readiness (Phase 4B.2)', () => {
  it('consumes the readiness endpoint and view-model without tax math', () => {
    const c = fs.readFileSync(path.join(process.cwd(), WEB_PAGE), 'utf8');
    expect(c).toContain('/api/v1/fiscal/inputs/');
    expect(c).toContain('mapToTaxInputReadinessViewModel');
    expect(c).toContain('taxInputReadinessQueryKey');
    expect(c).toContain('Dados necessários para apuração');
    expect(c).not.toMatch(/parseFloat|Number\s*\(/);
    expect(c).not.toMatch(/calculateTax|computeTax/i);
  });
});
