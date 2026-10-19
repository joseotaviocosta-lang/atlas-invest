'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacing } from '@atlas/ui';
import { StatCard } from '@/components/ui';
import { apiClient } from '@/api/client';
import { useHydrated } from '@/lib/use-hydrated';
import {
  MACRO_CONTEXT_QUERY_KEY,
  MACRO_CONTEXT_QUERY_OPTIONS,
  MacroContextResponse,
  buildMacroIndicatorCards,
} from './macro-indicators';

/**
 * Macro headline indicators (IBOVESPA, SELIC META, SELIC EFETIVA, IPCA, PTAX).
 *
 * Values come exclusively from GET /api/v1/macro/context. The panel is behind
 * a hydration gate so the server markup and the first client render are always
 * identical, keeping the page free of hydration text mismatches.
 */
export function MacroIndicatorCards() {
  const hydrated = useHydrated();

  const { data: macroContextData } = useQuery<MacroContextResponse>({
    queryKey: [...MACRO_CONTEXT_QUERY_KEY],
    queryFn: async () => {
      return apiClient.get('/api/v1/macro/context');
    },
    ...MACRO_CONTEXT_QUERY_OPTIONS,
  });

  const cards = buildMacroIndicatorCards(macroContextData, { hydrated });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: `${spacing.base}px`,
      }}
    >
      {cards.map((card) => (
        <StatCard
          key={card.id}
          label={card.label}
          value={card.value}
          subValue={card.subValue}
          isPlaceholder={card.isPlaceholder}
        />
      ))}
    </div>
  );
}
