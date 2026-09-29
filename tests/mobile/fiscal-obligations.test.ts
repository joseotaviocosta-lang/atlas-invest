import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';

describe('Mobile Fiscal obligations (Phase 4C.2)', () => {
  it('consumes the canonical obligation endpoint and shared view-model', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('/api/v1/fiscal/monthly/');
    expect(c).toContain('/obligation');
    expect(c).toContain('mapToTaxObligationViewModel');
    expect(c).toContain('taxObligationQueryKey');
  });

  it('renders obligation details read-only with no client tax math', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('Obrigações');
    expect(c).toContain('darfReadinessLabel');
    expect(c).not.toMatch(/parseFloat/);
    expect(c).not.toMatch(/Math\./);
    expect(c).not.toMatch(/computeTax|calculateTax|computeDue/i);
  });

  it('does not generate an official DARF or auto-pay', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).not.toMatch(/gerar\s*darf|emitir\s*darf|generateDarf|autoPay/i);
    expect(c).not.toContain('/payments');
  });
});
