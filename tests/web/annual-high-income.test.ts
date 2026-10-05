import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apiClient } from '@/api/client';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Web: annual high-income API contract (Phase 4I.5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET uses the canonical annual high-income route', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: null }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiClient.get('/api/v1/fiscal/annual/2026/high-income');

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/v1/fiscal/annual/2026/high-income');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('POST evidence sends value-only payload (never taxSubjectId, never authority)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: {}, meta: { outcome: 'CREATED', created: true } }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiClient.post('/api/v1/fiscal/annual/2026/high-income/evidence', {
      evidenceType: 'CORPORATE_TAX',
      payerId: 'PETR4',
      payerType: 'STANDARD_CORPORATE',
      profitPeriodExercise: 2026,
      evidenceMode: 'FULL',
      accountingProfit: '800000.00',
      irDue: '200000.00',
      csllDue: '68000.00',
      evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.taxSubjectId).toBeUndefined();
    expect(body.userId).toBeUndefined();
    expect(body.authority).toBeUndefined();
    expect(body.payerId).toBe('PETR4');
    expect(body.accountingProfit).toBe('800000.00');
  });

  it('resolve posts decision only', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {}, meta: { outcome: 'SUPERSEDED' } }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiClient.post('/api/v1/fiscal/annual/2026/high-income/evidence/ev-1/resolve', {
      decision: 'ACCEPT_NEW',
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      decision: 'ACCEPT_NEW',
    });
  });

  it('AnnualHighIncomeSection performs no client-side tax math', () => {
    const component = readWeb('apps/web/src/components/fiscal/AnnualHighIncomeSection.tsx');
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/Number\(/);
    expect(component).not.toMatch(/\bMath\.(pow|sqrt|round|floor|ceil|max|min)\b/);
    expect(component).not.toMatch(/\.amount\s*[*/+-]/);
    expect(component).not.toMatch(/rate\s*[*/]/);
  });

  it('high-income view-model performs no financial math', () => {
    const viewModel = readWeb('packages/ui/src/view-models/annual-high-income.view-model.ts');
    expect(viewModel).not.toMatch(/parseFloat/);
    expect(viewModel).not.toMatch(/Number\(/);
    expect(viewModel).not.toMatch(/\.amount\s*[*/+-]/);
  });
});
