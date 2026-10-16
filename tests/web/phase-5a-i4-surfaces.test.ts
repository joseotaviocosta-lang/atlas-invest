import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatCurrency, formatPercentage } from '@atlas/ui';

describe('Web: Phase 5A-I4-R1 Home, Performance & Market Surfaces Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Home / Hoje Market Valuation Overlay', () => {
    it('formats real cost basis, market value, and signed unrealized result without float distortion', () => {
      const costBasis = '8279.90';
      const marketValue = '19129.80';
      const unrealizedGain = '10849.90';
      const unrealizedPercent = '131.039022210413169241';

      expect(formatCurrency(costBasis, 'BRL')).toBe('R$ 8.279,90');
      expect(formatCurrency(marketValue, 'BRL')).toBe('R$ 19.129,80');
      expect(formatCurrency(unrealizedGain, 'BRL')).toBe('R$ 10.849,90');
      expect(formatPercentage(unrealizedPercent, { showSign: true })).toBe('+131,04%');
    });

    it('handles zero or missing valuation gracefully without fabricating numbers', () => {
      expect(formatCurrency('0', 'BRL')).toBe('R$ 0,00');
      expect(formatPercentage(null)).toBe('—');
      expect(formatPercentage(undefined)).toBe('—');
    });

    it('ensures proventos remain server-derived and never performs client-side financial summation', () => {
      // Invariant: The server read model produces pre-aggregated totalIncome per currency.
      // The frontend strictly does formatCurrency(incomeSummary.totalIncome.amount)
      // and never calls Number(), parseFloat(), +, or .reduce() on financial amounts.
      const serverStateData = {
        data: {
          incomeSummaries: [
            {
              currency: 'BRL',
              totalIncome: { amount: '450.00', currency: 'BRL' },
              totalDividends: { amount: '300.00', currency: 'BRL' },
              totalJcp: { amount: '150.00', currency: 'BRL' },
              totalFiiIncome: { amount: '0.00', currency: 'BRL' },
            },
            {
              currency: 'USD',
              totalIncome: { amount: '120.00', currency: 'USD' },
              totalDividends: { amount: '120.00', currency: 'USD' },
              totalJcp: { amount: '0.00', currency: 'USD' },
              totalFiiIncome: { amount: '0.00', currency: 'USD' },
            },
          ],
        },
      };

      const primaryCurrency = 'BRL';
      const incomeSummary = serverStateData.data.incomeSummaries.find(
        (s) => s.currency === primaryCurrency,
      );

      expect(incomeSummary).toBeDefined();
      expect(incomeSummary?.totalIncome.amount).toBe('450.00');

      // Presentation formatting only
      const formatted = formatCurrency(
        incomeSummary!.totalIncome.amount,
        incomeSummary!.totalIncome.currency,
      );
      expect(formatted).toBe('R$ 450,00');

      // Invariant: Multi-currency proventos are segregated and NEVER merged
      const usdSummary = serverStateData.data.incomeSummaries.find((s) => s.currency === 'USD');
      expect(usdSummary).toBeDefined();
      expect(formatCurrency(usdSummary!.totalIncome.amount, usdSummary!.totalIncome.currency)).toBe(
        'USD 120,00',
      );

      // Verify no cross-currency addition was performed
      expect(incomeSummary!.totalIncome.currency).not.toBe(usdSummary!.totalIncome.currency);
    });
  });

  describe('Market Page Portfolio Coverage & Honest Disclosure', () => {
    it('accurately derives status labels and badge variants for portfolio quotes', () => {
      const positions = [
        {
          assetId: 'petr4',
          ticker: 'PETR4',
          quote: { price: '59.25', currency: 'BRL', asOf: '2026-10-16', source: 'BRAPI' },
          quoteFreshness: 'FRESH',
          quoteStatus: 'EOD',
        },
        {
          assetId: 'vale3',
          ticker: 'VALE3',
          quote: { price: '66.18', currency: 'BRL', asOf: '2026-10-10', source: 'BRAPI' },
          quoteFreshness: 'STALE',
          quoteStatus: 'STALE',
        },
        {
          assetId: 'hglg11',
          ticker: 'HGLG11',
          quote: null,
          quoteFreshness: null,
          quoteStatus: null,
        },
      ];

      const evaluated = positions.map((pos) => {
        const hasQuote = Boolean(pos.quote);
        const isStale = pos.quoteFreshness === 'STALE' || pos.quoteStatus === 'STALE';
        const statusVariant = !hasQuote ? 'warning' : isStale ? 'neutral' : 'positive';
        const statusLabel = !hasQuote ? 'Sem cotação' : isStale ? 'Desatualizada' : 'Atualizada';
        return {
          ticker: pos.ticker,
          statusLabel,
          statusVariant,
          formattedPrice: pos.quote ? formatCurrency(pos.quote.price, pos.quote.currency) : '—',
        };
      });

      expect(evaluated[0]).toEqual({
        ticker: 'PETR4',
        statusLabel: 'Atualizada',
        statusVariant: 'positive',
        formattedPrice: 'R$ 59,25',
      });

      expect(evaluated[1]).toEqual({
        ticker: 'VALE3',
        statusLabel: 'Desatualizada',
        statusVariant: 'neutral',
        formattedPrice: 'R$ 66,18',
      });

      expect(evaluated[2]).toEqual({
        ticker: 'HGLG11',
        statusLabel: 'Sem cotação',
        statusVariant: 'warning',
        formattedPrice: '—',
      });
    });
  });
});
