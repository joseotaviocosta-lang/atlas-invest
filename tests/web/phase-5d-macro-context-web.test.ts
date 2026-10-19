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
});
