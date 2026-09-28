import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';

describe('Mobile Fiscal tab — tax input readiness (Phase 4B.2)', () => {
  it('consumes the readiness endpoint and view-model', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('/api/v1/fiscal/inputs/');
    expect(c).toContain('mapToTaxInputReadinessViewModel');
    expect(c).toContain('taxInputReadinessQueryKey');
    expect(c).toContain('Dados necessários para apuração');
  });

  it('performs no client-side tax math', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).not.toMatch(/parseFloat|Number\s*\(/);
    expect(c).not.toMatch(/Math\./);
  });
});
