import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';

describe('Mobile Fiscal tab (Phase 4A)', () => {
  it('consumes the canonical monthly fiscal endpoint and shared view-model', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('/api/v1/fiscal/monthly/');
    expect(c).toContain('mapToFiscalMonthlyViewModel');
    expect(c).toContain('fiscalMonthlyQueryKey');
    expect(c).toContain('competence');
  });

  it('contains no client-side tax math and exposes no tax due', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).not.toMatch(/parseFloat|Number\s*\(/);
    expect(c).not.toMatch(/Math\./);
    expect(c).not.toMatch(/taxDue|impostoDevido|darfDue/);
    expect(c).not.toMatch(/calculateTax|computeTax/i);
  });

  it('renders foundation states and quality issues, never DARF/IRPF generation', () => {
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('Dados incompletos');
    expect(c).toContain('Categorias de ativos');
    expect(c).toContain('Status da apuração');
    expect(c).not.toMatch(/gerar\s+darf|emitir\s+darf|gerar\s+irpf/i);
  });
});
