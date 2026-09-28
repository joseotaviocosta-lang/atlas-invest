import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

describe('Web Fiscal tab source boundaries (Phase 4A)', () => {
  it('consumes the canonical endpoint and shared view-model', () => {
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).toContain('/api/v1/fiscal/monthly/');
    expect(c).toContain('mapToFiscalMonthlyViewModel');
    expect(c).toContain('fiscalMonthlyQueryKey');
  });

  it('performs no client-side tax math and exposes no tax due', () => {
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).not.toMatch(/parseFloat|Number\s*\(/);
    expect(c).not.toMatch(/taxDue|impostoDevido/);
    expect(c).not.toMatch(/calculateTax|computeTax/i);
  });

  it('does not generate DARF or IRPF', () => {
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).not.toMatch(/gerar\s+darf|emitir\s+darf|gerar\s+irpf/i);
  });
});
