import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MacroIndicatorsGrid } from '../../apps/atlas-app/src/features/market/components/MacroIndicatorsGrid';
import { marketKeys } from '../../apps/atlas-app/src/lib/query-keys';

describe('PROJECT ATLAS — APP-16B: Macro Indicators Completeness (UI & Presentation)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders all 5 macro indicator cards with real formatted values, sources, and dates when available', () => {
    queryClient.setQueryData(marketKeys.macroContext(), {
      data: {
        selicTarget: {
          rate: '13.75% a.a.',
          formattedValue: '13,75% a.a.',
          effectiveDate: '2026-09-18',
          effectiveDateFormatted: '18/09/2026',
          source: 'Banco Central / Copom',
          freshness: 'FRESH',
          status: 'AVAILABLE',
        },
        selicEffective: {
          rate: '13.65% a.a.',
          formattedValue: '13,65% a.a.',
          effectiveDate: '2026-11-06',
          effectiveDateFormatted: '06/11/2026',
          source: 'Banco Central (SGS)',
          freshness: 'FRESH',
          status: 'AVAILABLE',
        },
        ipcaMonthly: {
          referenceMonth: '2026-09',
          referenceMonthFormatted: '09/2026',
          value: '0.82%',
          formattedValue: '0,82% no mês',
          source: 'IBGE',
          freshness: 'FRESH',
          status: 'AVAILABLE',
        },
        ptax: {
          rate: 'R$ 5,5007',
          value: '5.5007',
          effectiveDate: '2026-11-06',
          effectiveDateFormatted: '06/11/2026',
          source: 'Banco Central (PTAX)',
          convention: 'Venda (Fechamento PTAX)',
          freshness: 'FRESH',
          status: 'AVAILABLE',
        },
        ibovespa: {
          value: '—',
          status: 'OFFICIAL_SOURCE_UNAVAILABLE',
          message: 'Integração ainda não disponível',
          source: 'B3 (Oficial)',
        },
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MacroIndicatorsGrid />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Root grid
    expect(html).toContain('data-testid="macro-indicators-grid"');

    // 1. IBOVESPA card: honest source gap
    expect(html).toContain('IBOVESPA');
    expect(html).toContain('—');
    expect(html).toContain('Integração ainda não disponível');

    // 2. SELIC META card
    expect(html).toContain('SELIC META');
    expect(html).toContain('13,75% a.a.');
    expect(html).toContain('Meta Copom (18/09/2026)');
    expect(html).toContain('Banco Central / Copom');

    // 3. SELIC EFETIVA card
    expect(html).toContain('SELIC EFETIVA');
    expect(html).toContain('13,65% a.a.');
    expect(html).toContain('Taxa anualizada (06/11/2026)');
    expect(html).toContain('Banco Central (SGS)');

    // 4. IPCA (MENSAL) card
    expect(html).toContain('IPCA (MENSAL)');
    expect(html).toContain('0,82% no mês');
    expect(html).toContain('Variação mensal (09/2026)');
    expect(html).toContain('IBGE');

    // 5. DÓLAR (PTAX) card
    expect(html).toContain('DÓLAR (PTAX)');
    expect(html).toContain('R$ 5,5007');
    expect(html).toContain('Venda (Fechamento PTAX)');
    expect(html).toContain('06/11/2026');
    expect(html).toContain('Banco Central (PTAX)');

    // Manual sync action
    expect(html).toContain('data-testid="macro-sync-button"');
    expect(html).toContain('Sincronizar Indicadores');
  });

  it('renders honest uninitialized fallback when indicators are not yet synced', () => {
    queryClient.setQueryData(marketKeys.macroContext(), {
      data: {
        selicTarget: null,
        selicEffective: null,
        ipcaMonthly: null,
        ptax: null,
        ibovespa: null,
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MacroIndicatorsGrid />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Ainda não atualizado');
    expect(html).toContain('Aguardando sincronização do Bacen');
    expect(html).toContain('Aguardando sincronização do IBGE');
    expect(html).toContain('Integração ainda não disponível');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('offline resilience: preserves last-known-good values without wiping indicators', () => {
    queryClient.setQueryData(marketKeys.macroContext(), {
      data: {
        selicTarget: {
          rate: '13.75% a.a.',
          formattedValue: '13,75% a.a.',
          effectiveDate: '2026-09-18',
          effectiveDateFormatted: '18/09/2026',
          source: 'Banco Central / Copom',
          freshness: 'STALE',
          status: 'AVAILABLE',
        },
        ptax: {
          rate: 'R$ 5,4212',
          value: '5.4212',
          effectiveDate: '2026-10-30',
          effectiveDateFormatted: '30/10/2026',
          source: 'Banco Central (PTAX)',
          convention: 'Venda (Fechamento PTAX)',
          freshness: 'STALE',
          status: 'AVAILABLE',
        },
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MacroIndicatorsGrid />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('13,75% a.a.');
    expect(html).toContain('R$ 5,4212');
  });
});
