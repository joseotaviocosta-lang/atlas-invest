import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { mapToFiscalMonthlyViewModel, type RawFiscalMonthlyState } from '@atlas/ui';

const SAMPLE: RawFiscalMonthlyState = {
  competence: '2026-09',
  status: 'COMPLETE',
  eventCount: 1,
  currencies: ['BRL'],
  categories: [
    {
      category: 'BRAZILIAN_EQUITY',
      currency: 'BRL',
      capability: 'CALCULABLE',
      eventCount: 1,
      salesProceeds: null,
      realizedGain: null,
      realizedLoss: null,
      income: null,
      withholding: null,
      qualityIssues: [],
    },
  ],
  events: [
    {
      id: 'e1',
      sourceTransactionId: 't1',
      economicDate: '2026-09-10',
      competence: '2026-09',
      sourceTransactionType: 'BUY',
      eventType: 'PURCHASE',
      relevance: 'INFORMATIONAL',
      taxAssetCategory: 'BRAZILIAN_EQUITY',
      currency: 'BRL',
      quantity: '10',
      qualityIssues: [],
    },
  ],
  dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
  ruleSetVersion: 'BR_TEST_2026_V1',
  ruleSetStatus: 'TEST_ONLY',
  capabilities: {
    foundationOnly: true,
    productionRuleVerified: false,
    withholdingSupported: false,
    taxLiabilitySupported: false,
  },
  projectionVersion: 'fiscal-projection-v1',
  engineVersion: '0.1.0',
};

describe('Web: Fiscal monthly page data flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and maps the monthly fiscal state', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: SAMPLE }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
      '/api/v1/fiscal/monthly/2026-09',
    );
    const vm = mapToFiscalMonthlyViewModel(res.data)!;

    expect(vm.competenceLabel).toBe('09/2026');
    expect(vm.isComplete).toBe(true);
    expect(vm.eventCount).toBe(1);
    expect(vm.categories[0]!.categoryLabel).toBe('Ações brasileiras');
    expect(vm).not.toHaveProperty('taxDue');
  });

  it('renders EMPTY state without inventing tax due', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          ...SAMPLE,
          status: 'EMPTY',
          eventCount: 0,
          categories: [],
          events: [],
          dataQuality: { status: 'EMPTY', issues: [], issueCount: 0 },
        },
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
      '/api/v1/fiscal/monthly/2026-09',
    );
    const vm = mapToFiscalMonthlyViewModel(res.data)!;
    expect(vm.isEmpty).toBe(true);
    expect(vm.categories).toHaveLength(0);
  });

  it('surfaces invalid competence errors (no silent fallback)', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        code: 'FISCAL.INVALID_COMPETENCE',
        message: 'Invalid fiscal competence',
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(apiClient.get('/api/v1/fiscal/monthly/2026-13')).rejects.toBeTruthy();
  });
});
