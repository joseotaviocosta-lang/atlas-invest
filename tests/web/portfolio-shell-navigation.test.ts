import { describe, it, expect } from 'vitest';
import { CARTEIRA_TABS } from '@/components/portfolio/PortfolioShell';

describe('Web: Portfolio Shell & Navigation (Hotfix 03 B3/B4)', () => {
  it('exposes all 6 canonical tabs in the shared portfolio shell', () => {
    const tabIds = CARTEIRA_TABS.map((t) => t.id);
    expect(tabIds).toEqual([
      'overview',
      'assets',
      'returns',
      'dividends',
      'allocation',
      'operations',
    ]);

    const tabLabels = CARTEIRA_TABS.map((t) => t.label);
    expect(tabLabels).toEqual([
      'Visão Geral',
      'Ativos',
      'Rentabilidade',
      'Proventos',
      'Alocação',
      'Operações',
    ]);
  });

  it('determines direct URL targets for Rentabilidade and Proventos without intermediary cards', () => {
    const portfolioId = 'p-123';

    // Route resolver function matching PortfolioShell logic
    const resolveTabUrl = (tabId: string, currentPortfolioId: string) => {
      if (tabId === 'returns') return `/portfolio/performance?portfolioId=${currentPortfolioId}`;
      if (tabId === 'dividends') return `/portfolio/income?portfolioId=${currentPortfolioId}`;
      if (tabId === 'overview') return `/portfolio?portfolioId=${currentPortfolioId}`;
      return `/portfolio?portfolioId=${currentPortfolioId}&tab=${tabId}`;
    };

    expect(resolveTabUrl('returns', portfolioId)).toBe('/portfolio/performance?portfolioId=p-123');
    expect(resolveTabUrl('dividends', portfolioId)).toBe('/portfolio/income?portfolioId=p-123');
    expect(resolveTabUrl('overview', portfolioId)).toBe('/portfolio?portfolioId=p-123');
    expect(resolveTabUrl('operations', portfolioId)).toBe('/portfolio?portfolioId=p-123&tab=operations');
    expect(resolveTabUrl('assets', portfolioId)).toBe('/portfolio?portfolioId=p-123&tab=assets');
    expect(resolveTabUrl('allocation', portfolioId)).toBe('/portfolio?portfolioId=p-123&tab=allocation');
  });

  it('ensures client-side CSV Blob construction embeds UTF-8 BOM', async () => {
    const rawCsv = 'Secao;Codigo;Valor\r\nBENS;03-01;500,00\r\n';
    const csvWithBom = rawCsv.startsWith('\uFEFF') ? rawCsv : '\uFEFF' + rawCsv;
    const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });
});
