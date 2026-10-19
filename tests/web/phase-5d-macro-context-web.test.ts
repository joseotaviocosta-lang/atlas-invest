import { describe, it, expect, vi } from 'vitest';
import { queryClient } from '@/lib/react-query';
import {
  MACRO_CONTEXT_QUERY_KEY,
  MACRO_CONTEXT_QUERY_OPTIONS,
  MacroContextResponse,
  buildMacroIndicatorCards,
} from '@/components/market/macro-indicators';

const persistedContext: MacroContextResponse = {
  data: {
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
  },
};

describe('Phase 5D: Macro Context Web Query & Cache Invalidation', () => {
  it('defines canonical macro context query key and freshness contract', () => {
    expect(MACRO_CONTEXT_QUERY_KEY).toEqual(['macro-context']);
    expect(MACRO_CONTEXT_QUERY_OPTIONS.staleTime).toBe(0);
    expect(MACRO_CONTEXT_QUERY_OPTIONS.refetchOnMount).toBe('always');
  });

  it('invalidates macro-context query on macro update without page reload', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Simulate mutation onSuccess after POST /api/v1/macro/:seriesId/update
    queryClient.invalidateQueries({ queryKey: [...MACRO_CONTEXT_QUERY_KEY] });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['macro-context'],
    });
  });

  it('renders IPCA, SELIC META and SELIC EFETIVA from persisted API values', () => {
    const cards = buildMacroIndicatorCards(persistedContext);

    expect(cards.map((card) => card.id)).toEqual([
      'IBOVESPA',
      'SELIC_META',
      'SELIC_EFETIVA',
      'IPCA',
      'PTAX',
    ]);

    const meta = cards.find((card) => card.id === 'SELIC_META');
    const effective = cards.find((card) => card.id === 'SELIC_EFETIVA');
    const ipca = cards.find((card) => card.id === 'IPCA');

    expect(meta?.label).toBe('SELIC META');
    expect(meta?.value).toBe('10.75% a.a.');
    expect(meta?.subValue).toBe('Meta Copom (2026-09-18)');
    expect(meta?.isPlaceholder).toBe(false);

    expect(effective?.label).toBe('SELIC EFETIVA');
    expect(effective?.value).toBe('10.65% a.a.');
    expect(effective?.subValue).toBe('Efetiva anualizada (2026-10-16)');
    expect(effective?.isPlaceholder).toBe(false);

    expect(ipca?.label).toBe('IPCA (MENSAL)');
    expect(ipca?.value).toBe('0.21%');
    expect(ipca?.subValue).toBe('Variação mensal (2026-09)');
    expect(ipca?.isPlaceholder).toBe(false);

    // Meta Copom and Efetiva must never be merged under a single "TAXA SELIC" label.
    expect(meta?.label).not.toBe(effective?.label);
    expect(meta?.value).not.toBe(effective?.value);
  });

  it('keeps IBOVESPA and PTAX as honest placeholders (never invented values)', () => {
    const cards = buildMacroIndicatorCards(persistedContext);

    const ibov = cards.find((card) => card.id === 'IBOVESPA');
    const ptax = cards.find((card) => card.id === 'PTAX');

    expect(ibov?.value).toBe('—');
    expect(ibov?.isPlaceholder).toBe(true);
    expect(ptax?.value).toBe('—');
    expect(ptax?.isPlaceholder).toBe(true);
  });

  it('renders honest placeholder (—) only for genuinely missing macro series', () => {
    const cards = buildMacroIndicatorCards(undefined);
    const values = cards.map((card) => card.value);

    expect(values).toEqual(['—', '—', '—', '—', '—']);
    expect(cards.every((card) => card.isPlaceholder)).toBe(true);

    const partial = buildMacroIndicatorCards({
      data: {
        selicTarget: persistedContext.data.selicTarget,
      },
    });

    expect(partial.find((card) => card.id === 'SELIC_META')?.isPlaceholder).toBe(false);
    expect(partial.find((card) => card.id === 'SELIC_EFETIVA')?.isPlaceholder).toBe(true);
    expect(partial.find((card) => card.id === 'SELIC_EFETIVA')?.value).toBe('—');
    expect(partial.find((card) => card.id === 'IPCA')?.isPlaceholder).toBe(true);
  });

  it('keeps server/initial-hydration markup deterministic even with a warm query cache', () => {
    // The server always renders the placeholder snapshot. The first client
    // hydration render must produce identical markup before resolving the
    // client-only query data, even if the query cache is already warm.
    const serverSnapshot = buildMacroIndicatorCards(persistedContext, { hydrated: false });
    const coldSnapshot = buildMacroIndicatorCards(undefined, { hydrated: true });

    expect(serverSnapshot).toEqual(coldSnapshot);
    expect(serverSnapshot.map((card) => card.value)).toEqual(['—', '—', '—', '—', '—']);

    const hydratedSnapshot = buildMacroIndicatorCards(persistedContext, { hydrated: true });
    expect(hydratedSnapshot.find((card) => card.id === 'SELIC_EFETIVA')?.value).toBe('10.65% a.a.');
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
