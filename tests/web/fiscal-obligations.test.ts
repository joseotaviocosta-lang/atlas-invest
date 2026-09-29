import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { apiClient } from '@/api/client';
import { mapToTaxObligationViewModel, type RawTaxObligation } from '@atlas/ui';

const COMPONENT = 'apps/web/src/components/fiscal/TaxObligationSection.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

const SAMPLE: RawTaxObligation = {
  id: 'o1',
  competence: '2026-08',
  taxBucket: 'FII_SALE',
  revenueCode: '6015',
  status: 'OPEN',
  baseStatus: 'OPEN',
  reasonCode: null,
  principalAmount: { amount: '199.9', currency: 'BRL' },
  currency: 'BRL',
  dueDate: '2026-09-30',
  darfReadiness: 'READY',
  darfReadinessReason: null,
  dataQuality: 'COMPLETE',
  liabilityFingerprint: 'x'.repeat(64),
  revision: 1,
  deadline: null,
  darfPreparation: null,
  payments: [],
  supersededById: null,
  createdAt: '2026-09-29T00:00:00.000Z',
};

describe('Web: tax obligations UX (Phase 4C.2)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('consumes the canonical obligation and payment endpoints', () => {
    const c = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(c).toContain('/api/v1/fiscal/monthly/');
    expect(c).toContain('/obligation');
    expect(c).toContain('/api/v1/fiscal/obligations');
    expect(c).toContain('/payments');
    expect(c).toContain('MANUAL_CONFIRMED');
    expect(c).toContain('Marcar como pago');
  });

  it('performs no client tax/date math and never generates an official DARF', () => {
    const c = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(c).not.toMatch(/parseFloat/);
    expect(c).not.toMatch(/calculateTax|computeTax|computeDue|isOverdue/i);
    expect(c).not.toMatch(/gerar\s*darf|emitir\s*darf|generateDarf/i);
  });

  it('is wired into the fiscal page', () => {
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).toContain('TaxObligationSection');
  });

  it('fetches and maps an obligation through the shared view-model', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: SAMPLE }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    const res = await apiClient.get<{ data: RawTaxObligation }>(
      '/api/v1/fiscal/monthly/2026-08/obligation',
    );
    const vm = mapToTaxObligationViewModel(res.data)!;
    expect(vm.competenceLabel).toBe('08/2026');
    expect(vm.revenueCode).toBe('6015');
    expect(vm.dueDateFormatted).toBe('30/09/2026');
    expect(vm).not.toHaveProperty('taxDue');
  });
});
