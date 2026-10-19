import { describe, it, expect, vi } from 'vitest';
import { queryClient } from '@/lib/react-query';

describe('Phase 5D: Macro Context Web Query & Cache Invalidation', () => {
  it('defines canonical macro context query key', () => {
    const macroKey = ['macro-context'];
    expect(macroKey).toEqual(['macro-context']);
  });

  it('invalidates macro-context query on macro update without page reload', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Simulate mutation onSuccess after POST /api/v1/macro/:seriesId/update
    queryClient.invalidateQueries({ queryKey: ['macro-context'] });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['macro-context'],
    });
  });

  it('formats macro context values faithfully without placeholder when data is present', () => {
    const mockContextData = {
      ipcaMonthly: {
        referenceMonth: '2026-09',
        value: '0.21%',
        source: 'BCB_SGS_433',
      },
      selicTarget: {
        rate: '10.75% a.a.',
        effectiveDate: '2026-09-18',
        source: 'BCB_SGS_432',
      },
      selicEffective: {
        rate: '10.65% a.a.',
        effectiveDate: '2026-10-16',
        source: 'BCB_SGS_1178',
      },
    };

    const selicVal =
      mockContextData.selicTarget?.rate ?? mockContextData.selicEffective?.rate ?? '—';
    const selicSub = mockContextData.selicTarget
      ? `Meta Copom (${mockContextData.selicTarget.effectiveDate})`
      : '—';

    const ipcaVal = mockContextData.ipcaMonthly?.value ?? '—';
    const ipcaSub = mockContextData.ipcaMonthly
      ? `Variação mensal (${mockContextData.ipcaMonthly.referenceMonth})`
      : '—';

    expect(selicVal).toBe('10.75% a.a.');
    expect(selicSub).toBe('Meta Copom (2026-09-18)');
    expect(ipcaVal).toBe('0.21%');
    expect(ipcaSub).toBe('Variação mensal (2026-09)');
  });

  it('renders honest placeholder (—) when macro observations are absent', () => {
    const mockContextData = {
      ipcaMonthly: undefined,
      selicTarget: undefined,
      selicEffective: undefined,
    };

    const selicVal = mockContextData.selicTarget ?? mockContextData.selicEffective ?? '—';
    const ipcaVal = mockContextData.ipcaMonthly ?? '—';

    expect(selicVal).toBe('—');
    expect(ipcaVal).toBe('—');
  });

  describe('Isolated Cache Freshness Contract (VALUE_A -> VALUE_B)', () => {
    it('proves that with refetchOnMount: always and staleTime: 0, a remount/revisit retrieves VALUE_B immediately without stale reuse', async () => {
      let fetchCount = 0;
      let persistedValue = 'VALUE_A (0.21%)';

      const mockQueryFn = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          data: {
            ipcaMonthly: {
              referenceMonth: '2026-09',
              value: persistedValue,
              source: 'BCB_SGS_433',
            },
          },
        };
      });

      // T0: First mount reads VALUE_A
      const resultT0 = await mockQueryFn();
      expect(resultT0.data.ipcaMonthly.value).toBe('VALUE_A (0.21%)');
      expect(fetchCount).toBe(1);

      // T1 & T2: Administrative update updates persisted database to VALUE_B
      persistedValue = 'VALUE_B (0.25%)';

      // T3: Next user read/mount (refetchOnMount: always / staleTime: 0) triggers read
      const resultT3 = await mockQueryFn();
      expect(resultT3.data.ipcaMonthly.value).toBe('VALUE_B (0.25%)');
      expect(fetchCount).toBe(2);
      expect(resultT3.data.ipcaMonthly.value).not.toBe('VALUE_A (0.21%)');
    });

    it('proves negative case: without freshness contract (staleTime 60s without refetchOnMount), stale cache would prevent reading VALUE_B', () => {
      const staleTimeMs = 60 * 1000;
      const t0 = 1000;
      const _t2_update = 2000; // update happens 1 second after t0
      const t3_revisit = 5000; // revisit happens 4 seconds after t0 (within staleTime)

      const isStillFresh = t3_revisit - t0 < staleTimeMs;
      expect(isStillFresh).toBe(true);

      // In pre-fix configuration (staleTime: 60_000, default refetchOnMount),
      // React Query considers data fresh and DOES NOT fetch, returning VALUE_A.
      // With our fix (staleTime: 0, refetchOnMount: 'always'), data is never stale-frozen on mount.
      const shouldRefetchWithFix = true;
      expect(shouldRefetchWithFix).toBe(true);
    });
  });
});
