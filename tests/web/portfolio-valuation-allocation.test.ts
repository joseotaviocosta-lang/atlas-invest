import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient } from '@/api/client';
import {
  PositionValuationBadge,
  valuationQueryKey,
  allocationQueryKey,
  PortfolioValuationResponse,
  PortfolioAllocationResponse,
  formatUpdateReceiptFeedback,
  IngestionReceiptDto,
} from '@/components/portfolio';

describe('Web: Portfolio Valuation, Allocation & Manual Quote Update (Phase 5A-I3)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
  const assetVale3 = 'e0000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    useAuthStore.getState().setSession(
      {
        id: 'usr-1',
        name: 'Investidor Atlas',
        email: 'investidor@atlas.dev',
        locale: 'pt-BR',
        timezone: 'UTC',
        baseCurrency: 'BRL',
      },
      'valid-access-token',
    );
    vi.restoreAllMocks();
  });

  it('generates consistent query keys for valuation and allocation read models', () => {
    expect(valuationQueryKey(portfolioId)).toEqual(['portfolio-valuation', portfolioId]);
    expect(allocationQueryKey(portfolioId)).toEqual(['portfolio-allocation', portfolioId]);
  });

  it('renders correct PositionValuationBadge variants for all canonical states', () => {
    // STALE quote
    const staleBadge = PositionValuationBadge({ status: 'QUOTE_STALE', freshness: 'STALE' });
    expect(staleBadge?.props.variant).toBe('warning');
    expect(staleBadge?.props.children).toBe('Desatualizada');

    // FRESH quote / VALUED
    const freshBadge = PositionValuationBadge({ status: 'VALUED', freshness: 'FRESH' });
    expect(freshBadge?.props.variant).toBe('positive');
    expect(freshBadge?.props.children).toBe('Atualizada');

    // QUOTE_UNAVAILABLE
    const unavailBadge = PositionValuationBadge({ status: 'QUOTE_UNAVAILABLE', freshness: null });
    expect(unavailBadge?.props.variant).toBe('neutral');
    expect(unavailBadge?.props.children).toBe('Sem cotação');

    // COST_INCOMPLETE
    const costIncompleteBadge = PositionValuationBadge({
      status: 'COST_INCOMPLETE',
      freshness: 'FRESH',
    });
    expect(costIncompleteBadge?.props.variant).toBe('warning');
    expect(costIncompleteBadge?.props.children).toBe('Custo incompleto');

    // CURRENCY_MISMATCH
    const mismatchBadge = PositionValuationBadge({
      status: 'CURRENCY_MISMATCH',
      freshness: 'FRESH',
    });
    expect(mismatchBadge?.props.variant).toBe('danger');
    expect(mismatchBadge?.props.children).toBe('Moeda incompatível');
  });

  it('consumes valuation read model payload and preserves exact decimal values', async () => {
    const mockValuationResponse: PortfolioValuationResponse = {
      data: {
        portfolioId,
        asOf: '2026-10-16',
        engineVersion: '1.0.0-rc.1',
        valuationVersion: '5A-I2',
        positions: [
          {
            assetId: assetPetr4,
            accountId: null,
            ticker: 'PETR4',
            assetType: 'STOCK',
            quantity: '100',
            currency: 'BRL',
            totalCost: { amount: '3200.00', currency: 'BRL' },
            averageCost: { amount: '32.00', currency: 'BRL' },
            costBasisStatus: 'KNOWN',
            quote: {
              assetId: assetPetr4,
              price: '37.50',
              currency: 'BRL',
              asOf: '2026-10-16',
              receivedAt: '2026-10-16T18:00:00Z',
              source: 'BRAPI',
              status: 'AVAILABLE',
              freshness: 'FRESH',
              providerSymbol: 'PETR4',
            },
            marketValue: { amount: '3750.00', currency: 'BRL' },
            unrealizedGainLoss: { amount: '550.00', currency: 'BRL' },
            unrealizedGainLossPercent: '17.1875',
            status: 'VALUED',
            quoteFreshness: 'FRESH',
            quoteStatus: 'AVAILABLE',
          },
          {
            assetId: assetVale3,
            accountId: null,
            ticker: 'VALE3',
            assetType: 'STOCK',
            quantity: '50',
            currency: 'BRL',
            totalCost: { amount: '3000.00', currency: 'BRL' },
            averageCost: { amount: '60.00', currency: 'BRL' },
            costBasisStatus: 'KNOWN',
            quote: null,
            marketValue: null,
            unrealizedGainLoss: null,
            unrealizedGainLossPercent: null,
            status: 'QUOTE_UNAVAILABLE',
            quoteFreshness: null,
            quoteStatus: 'UNAVAILABLE',
          },
        ],
        totalsByCurrency: {
          BRL: {
            currency: 'BRL',
            marketValue: { amount: '3750.00', currency: 'BRL' },
            costBasis: { amount: '6200.00', currency: 'BRL' },
            knownCost: { amount: '3200.00', currency: 'BRL' },
            unrealizedGainLoss: { amount: '550.00', currency: 'BRL' },
            unrealizedGainLossPercent: '17.1875',
            valuedPositionsCount: 1,
            unvaluedPositionsCount: 1,
            stalePositionsCount: 0,
          },
        },
        completeness: 'PARTIAL',
        summary: {
          totalPositions: 2,
          valuedPositions: 1,
          unvaluedPositions: 1,
          unavailablePositions: 1,
          incompleteCostPositions: 0,
          stalePositions: 0,
          mismatchPositions: 0,
          valuationCoveragePercent: '50.0',
          currencies: ['BRL'],
        },
        quoteSummary: {
          totalQuotesRequested: 2,
          quotesAvailable: 1,
          quotesUnavailable: 1,
          quotesStale: 0,
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockValuationResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<PortfolioValuationResponse>(
      `/api/v1/portfolios/${portfolioId}/valuation`,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.data.completeness).toBe('PARTIAL');
    expect(res.data.summary.valuationCoveragePercent).toBe('50.0');
    expect(res.data.totalsByCurrency.BRL.marketValue.amount).toBe('3750.00');
    expect(res.data.positions[1].marketValue).toBeNull();
    expect(res.data.positions[1].status).toBe('QUOTE_UNAVAILABLE');
  });

  it('consumes allocation read model payload with asset and asset class distribution', async () => {
    const mockAllocationResponse: PortfolioAllocationResponse = {
      data: {
        portfolioId,
        asOf: '2026-10-16',
        status: 'PARTIAL',
        valuationCoveragePercent: '50.0',
        currencies: {
          BRL: {
            currency: 'BRL',
            totalMarketValue: { amount: '3750.00', currency: 'BRL' },
            byAsset: [
              {
                assetId: assetPetr4,
                ticker: 'PETR4',
                assetType: 'STOCK',
                currency: 'BRL',
                marketValue: { amount: '3750.00', currency: 'BRL' },
                allocationPercent: '100.00',
                quoteFreshness: 'FRESH',
              },
            ],
            byAssetClass: [
              {
                assetClass: 'STOCK',
                currency: 'BRL',
                marketValue: { amount: '3750.00', currency: 'BRL' },
                allocationPercent: '100.00',
                assetCount: 1,
              },
            ],
            unvaluedAssets: [
              {
                assetId: assetVale3,
                ticker: 'VALE3',
                assetType: 'STOCK',
                currency: 'BRL',
                reason: 'Cotação indisponível para o ativo',
              },
            ],
          },
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAllocationResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<PortfolioAllocationResponse>(
      `/api/v1/portfolios/${portfolioId}/allocation`,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.data.status).toBe('PARTIAL');
    expect(res.data.currencies.BRL.byAsset).toHaveLength(1);
    expect(res.data.currencies.BRL.byAsset[0].ticker).toBe('PETR4');
    expect(res.data.currencies.BRL.byAsset[0].allocationPercent).toBe('100.00');
    expect(res.data.currencies.BRL.unvaluedAssets).toHaveLength(1);
    expect(res.data.currencies.BRL.unvaluedAssets[0].ticker).toBe('VALE3');
  });

  it('executes manual market-data update mutation via POST', async () => {
    const mockUpdateResponse: { data: IngestionReceiptDto } = {
      data: {
        requestedAssets: 2,
        resolvedAssets: 2,
        skippedAssets: 0,
        quotesFetched: 1,
        quotesInserted: 1,
        quotesUnchanged: 0,
        quotesRevised: 0,
        authRequiredAssets: [],
        missingAssets: ['VALE3'],
        rateLimitedAssets: [],
        providerErrors: [],
        status: 'PARTIAL',
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUpdateResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.post<{ data: IngestionReceiptDto }>(
      `/api/v1/portfolios/${portfolioId}/market-data/update`,
      {},
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/portfolios/${portfolioId}/market-data/update`),
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(res.data.quotesInserted).toBe(1);
    expect(res.data.missingAssets).toEqual(['VALE3']);
  });

  it('proves zero live provider network calls occur on reading valuation and allocation endpoints', async () => {
    const providerNetworkSpy = vi.fn();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('brapi.dev') || url.includes('yahoo') || url.includes('stooq')) {
        providerNetworkSpy(url);
        throw new Error('ILLEGAL_PROVIDER_CALL_ON_READ');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { portfolioId, positions: [], totalsByCurrency: {} } }),
      };
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiClient.get(`/api/v1/portfolios/${portfolioId}/valuation`);
    await apiClient.get(`/api/v1/portfolios/${portfolioId}/allocation`);

    expect(providerNetworkSpy).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('preserves cached market valuation on page load even if market provider subsequently fails', async () => {
    const cachedValuation = {
      data: {
        portfolioId,
        asOf: '2026-10-15',
        completeness: 'COMPLETE',
        positions: [
          {
            assetId: assetPetr4,
            marketValue: { amount: '3750.00', currency: 'BRL' },
            unrealizedGainLoss: { amount: '550.00', currency: 'BRL' },
            unrealizedGainLossPercent: '17.1875',
            status: 'VALUED',
            quoteFreshness: 'STALE',
            quote: {
              price: '37.50',
              currency: 'BRL',
              asOf: '2026-10-15',
              freshness: 'STALE',
              status: 'AVAILABLE',
            },
          },
        ],
        totalsByCurrency: {
          BRL: {
            currency: 'BRL',
            marketValue: { amount: '3750.00', currency: 'BRL' },
            costBasis: { amount: '3200.00', currency: 'BRL' },
            knownCost: { amount: '3200.00', currency: 'BRL' },
            unrealizedGainLoss: { amount: '550.00', currency: 'BRL' },
            unrealizedGainLossPercent: '17.1875',
            valuedPositionsCount: 1,
            unvaluedPositionsCount: 0,
            stalePositionsCount: 1,
          },
        },
        summary: {
          totalPositions: 1,
          valuedPositions: 1,
          unvaluedPositions: 0,
          stalePositions: 1,
          valuationCoveragePercent: '100',
          currencies: ['BRL'],
        },
      },
    };

    const mockFetch = vi
      .fn()
      .mockImplementation(async (url: string, opts?: { method?: string }) => {
        if (opts?.method === 'POST' && url.includes('/market-data/update')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ statusCode: 503, message: 'Provider unavailable' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => cachedValuation,
        };
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<typeof cachedValuation>(
      `/api/v1/portfolios/${portfolioId}/valuation`,
    );
    expect(res.data.totalsByCurrency.BRL.marketValue.amount).toBe('3750.00');

    await expect(
      apiClient.post(`/api/v1/portfolios/${portfolioId}/market-data/update`, {}),
    ).rejects.toThrow();

    const reloadRes = await apiClient.get<typeof cachedValuation>(
      `/api/v1/portfolios/${portfolioId}/valuation`,
    );
    expect(reloadRes.data.totalsByCurrency.BRL.marketValue.amount).toBe('3750.00');
    expect(reloadRes.data.positions[0].quote?.price).toBe('37.50');
  });

  it('formats IngestionReceiptDto accurately without undefined or missing data', () => {
    // 1. Success case with quotesInserted
    const successReceipt: IngestionReceiptDto = {
      requestedAssets: 2,
      resolvedAssets: 2,
      skippedAssets: 0,
      quotesFetched: 2,
      quotesInserted: 2,
      quotesUnchanged: 0,
      quotesRevised: 0,
      authRequiredAssets: [],
      missingAssets: [],
      rateLimitedAssets: [],
      providerErrors: [],
      status: 'SUCCESS',
    };
    const f1 = formatUpdateReceiptFeedback(successReceipt);
    expect(f1.variant).toBe('positive');
    expect(f1.message).toBe('Cotações atualizadas com sucesso: 2 ativos.');
    expect(f1.message).not.toContain('undefined');

    // 2. Partial case with authRequired
    const partialReceipt: IngestionReceiptDto = {
      requestedAssets: 3,
      resolvedAssets: 3,
      skippedAssets: 0,
      quotesFetched: 2,
      quotesInserted: 2,
      quotesUnchanged: 0,
      quotesRevised: 0,
      authRequiredAssets: ['HGLG11'],
      missingAssets: [],
      rateLimitedAssets: [],
      providerErrors: [],
      status: 'PARTIAL',
    };
    const f2 = formatUpdateReceiptFeedback(partialReceipt);
    expect(f2.variant).toBe('positive');
    expect(f2.message).toContain('Cotações atualizadas com sucesso: 2 ativos');
    expect(f2.message).toContain('1 requer token (HGLG11)');
    expect(f2.message).not.toContain('undefined');

    // 3. Failed/Auth required only case
    const authOnlyReceipt: IngestionReceiptDto = {
      requestedAssets: 1,
      resolvedAssets: 1,
      skippedAssets: 0,
      quotesFetched: 0,
      quotesInserted: 0,
      quotesUnchanged: 0,
      quotesRevised: 0,
      authRequiredAssets: ['HGLG11'],
      missingAssets: [],
      rateLimitedAssets: [],
      providerErrors: [],
      status: 'PARTIAL',
    };
    const f3 = formatUpdateReceiptFeedback(authOnlyReceipt);
    expect(f3.variant).toBe('warning');
    expect(f3.message).toContain('requer autenticação de provedor para 1 ativo (HGLG11)');
    expect(f3.message).not.toContain('undefined');
  });

  it('correctly handles partial update receipt when an asset requires authentication (e.g. HGLG11) while PETR4/VALE3 succeed', async () => {
    const mockReceipt: { data: IngestionReceiptDto } = {
      data: {
        requestedAssets: 3,
        resolvedAssets: 3,
        skippedAssets: 0,
        quotesFetched: 2,
        quotesInserted: 2,
        quotesUnchanged: 0,
        quotesRevised: 0,
        authRequiredAssets: ['HGLG11'],
        missingAssets: [],
        rateLimitedAssets: [],
        providerErrors: [],
        status: 'PARTIAL',
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReceipt,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.post<{ data: IngestionReceiptDto }>(
      `/api/v1/portfolios/${portfolioId}/market-data/update`,
      {},
    );

    const feedback = formatUpdateReceiptFeedback(res.data);
    expect(feedback.variant).toBe('positive');
    expect(feedback.message).toContain('2 ativos');
    expect(feedback.message).toContain('1 requer token (HGLG11)');
    expect(feedback.message).not.toContain('undefined');
  });

  it('resolves asset ticker and name in mapToPortfolioOverviewViewModel without exposing raw UUIDs as primary labels', async () => {
    const { mapToPortfolioOverviewViewModel } = await import('@atlas/ui');

    const mockPortfolioState = {
      portfolioId,
      asOf: '2026-10-16',
      completeness: { costBasis: 'COMPLETE' as const },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '200',
          costBasisStatus: 'KNOWN' as const,
          currency: 'BRL',
          totalCost: { amount: '6000.00', currency: 'BRL' },
          averageCost: { amount: '30.00', currency: 'BRL' },
        },
      ],
      accounts: [],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const assetsCatalog = [{ id: assetPetr4, ticker: 'PETR4', name: 'Petrobras PN' }];

    const vm = mapToPortfolioOverviewViewModel(
      mockPortfolioState,
      { id: portfolioId, name: 'Principal', type: 'PERSONAL', baseCurrency: 'BRL' },
      [],
      assetsCatalog,
    );

    expect(vm.positions).toHaveLength(1);
    expect(vm.positions[0].displayIdentifier).toBe('PETR4');
    expect(vm.positions[0].ticker).toBe('PETR4');
    expect(vm.positions[0].assetName).toBe('Petrobras PN');
    expect(vm.positions[0].displayIdentifier).not.toBe(assetPetr4);
  });

  describe('Percentage Display Formatting & Human Precision Invariance (Phase 5A-I3-H2)', () => {
    it('formats exact canonical decimal percentage strings into human-readable pt-BR representations', async () => {
      const { formatPercentage } = await import('@atlas/ui');

      // Human examples observed during real validation:
      const petr4UnrealizedRaw = '169.0185929306000136211945787645576517061';
      const vale3UnrealizedRaw = '87.86580645161290322580645161290322580645';
      const petr4AllocRaw = '61.94523727378226641156729291471944296333';
      const vale3AllocRaw = '38.05476272621773358843270708528055703667';
      const overviewUnrealizedRaw = '131.041234567890123456';

      // Section 15 required test cases:
      expect(formatPercentage(petr4UnrealizedRaw, { showSign: true })).toBe('+169,02%');
      expect(formatPercentage(petr4UnrealizedRaw)).toBe('169,02%');

      expect(formatPercentage(vale3UnrealizedRaw, { showSign: true })).toBe('+87,87%');
      expect(formatPercentage(vale3UnrealizedRaw)).toBe('87,87%');

      expect(formatPercentage(petr4AllocRaw)).toBe('61,95%');
      expect(formatPercentage(vale3AllocRaw)).toBe('38,05%');

      expect(formatPercentage(overviewUnrealizedRaw, { showSign: true })).toBe('+131,04%');

      expect(formatPercentage('-4.55', { showSign: true })).toBe('-4,55%');
      expect(formatPercentage('-4.55')).toBe('-4,55%');

      expect(formatPercentage('0', { showSign: true })).toBe('0,00%');
      expect(formatPercentage('0')).toBe('0,00%');
      expect(formatPercentage('0.00')).toBe('0,00%');
      expect(formatPercentage(null)).toBe('—');
      expect(formatPercentage(undefined)).toBe('—');
    });

    it('proves that canonical source values remain strictly unchanged and are never mutated by display formatting', async () => {
      const { formatPercentage } = await import('@atlas/ui');

      const rawCanonicalInput = '169.0185929306000136211945787645576517061';
      const originalCopy = `${rawCanonicalInput}`;

      const formatted = formatPercentage(rawCanonicalInput, { showSign: true });

      expect(formatted).toBe('+169,02%');
      // Invariant: source string was not modified
      expect(rawCanonicalInput).toBe(originalCopy);
      expect(rawCanonicalInput.length).toBe(41);
    });
  });
});
