import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { mapToMonthlyTaxLiabilityViewModel, type RawMonthlyTaxLiability } from '@atlas/ui';

const SAMPLE: RawMonthlyTaxLiability = {
  competence: '2026-09',
  status: 'BLOCKED',
  ruleVersions: [],
  categories: [],
  totalTaxBeforeCredits: null,
  creditsApplied: null,
  taxDue: null,
  openingLossBalances: [],
  closingLossBalances: [],
  dataQuality: { status: 'BLOCKED', issues: ['MISSING_RULE_SET'], issueCount: 1 },
  capabilities: {
    foundationOnly: true,
    productionRuleVerified: false,
    withholdingSupported: false,
    taxLiabilitySupported: false,
  },
  calculationVersion: 'tax-calculation-v1',
  engineVersion: '0.1.0',
  limitations: [],
  traceSummary: [],
};

describe('Web: Monthly tax liability data flow', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches and maps the liability, never showing fake tax due', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: SAMPLE }) });
    global.fetch = mockFetch as unknown as typeof fetch;
    const res = await apiClient.get<{ data: RawMonthlyTaxLiability }>(
      '/api/v1/fiscal/monthly/2026-09/liability',
    );
    const vm = mapToMonthlyTaxLiabilityViewModel(res.data)!;
    expect(vm.isBlocked).toBe(true);
    expect(vm.hasTaxDue).toBe(false);
    expect(vm.taxDueFormatted).toBe('—');
  });

  it('surfaces invalid competence errors', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ code: 'FISCAL.INVALID_COMPETENCE' }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    await expect(apiClient.get('/api/v1/fiscal/monthly/2026-13/liability')).rejects.toBeTruthy();
  });
});
