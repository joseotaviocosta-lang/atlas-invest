import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortfolioOpportunityRadarController } from '../../apps/api/src/modules/portfolios/portfolio-opportunity-radar.controller';
import { GetOpportunityRadarUseCase } from '../../apps/api/src/application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { OpportunityRadarCacheService } from '../../apps/api/src/application/portfolios/opportunity-radar/opportunity-radar-cache.service';
import { OPPORTUNITY_MODEL_VERSION } from '@atlas/market-data';
import { NotFoundException } from '@nestjs/common';

describe('APP-16F: Opportunity Radar Controller & Use Case', () => {
  let controller: PortfolioOpportunityRadarController;
  let useCase: GetOpportunityRadarUseCase;
  let cache: OpportunityRadarCacheService;

  let mockPortfolioRepo: any;
  let mockAssetRepo: any;
  let mockIntelligenceRepo: any;
  let mockValuationUseCase: any;
  let mockStrategyUseCase: any;
  let mockConfigService: any;

  const portfolioId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000001';
  const principal = { userId, sessionId: 'sess-1' } as any;

  beforeEach(() => {
    cache = new OpportunityRadarCacheService();

    mockPortfolioRepo = {
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === portfolioId) {
          return Promise.resolve({ id: portfolioId, userId, name: 'Carteira Principal' });
        }
        return Promise.resolve(null);
      }),
    };

    mockAssetRepo = {
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === 'asset-petr4') return Promise.resolve({ id, ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' });
        if (id === 'asset-hglg11') return Promise.resolve({ id, ticker: 'HGLG11', name: 'CSHG Logística', type: 'FII' });
        return Promise.resolve(null);
      }),
    };

    mockIntelligenceRepo = {
      list: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    };

    mockValuationUseCase = {
      execute: vi.fn().mockResolvedValue({
        portfolioId,
        positions: [
          {
            assetId: 'asset-petr4',
            ticker: 'PETR4',
            assetType: 'STOCK',
            quantity: '100',
            currency: 'BRL',
            status: 'VALUED',
            marketValue: { amount: '4000.00', currency: 'BRL' },
            quote: { price: '40.00', asOf: '2026-11-09' },
            quoteFreshness: 'FRESH',
          },
          {
            assetId: 'asset-hglg11',
            ticker: 'HGLG11',
            assetType: 'FII',
            quantity: '50',
            currency: 'BRL',
            status: 'VALUED',
            marketValue: { amount: '8000.00', currency: 'BRL' },
            quote: { price: '160.00', asOf: '2026-11-09' },
            quoteFreshness: 'FRESH',
          },
        ],
      }),
    };

    mockStrategyUseCase = {
      getStrategy: vi.fn().mockResolvedValue({
        portfolioId,
        targets: [
          { category: 'STOCK', targetBp: 5000 },
          { category: 'FII', targetBp: 5000 },
        ],
      }),
    };

    mockConfigService = {
      getStatus: vi.fn().mockReturnValue({
        provider: 'BRAPI',
        authenticated: true,
        source: 'ENVIRONMENT',
        status: 'CONFIGURED',
      }),
    };

    useCase = new GetOpportunityRadarUseCase(
      mockPortfolioRepo,
      mockAssetRepo,
      mockIntelligenceRepo,
      mockValuationUseCase,
      mockStrategyUseCase,
      cache,
      mockConfigService,
    );

    controller = new PortfolioOpportunityRadarController(useCase);
  });

  // 1. GET /api/v1/portfolios/:portfolioId/opportunity-radar returns 200 with contract
  it('1. GET /api/v1/portfolios/:portfolioId/opportunity-radar returns data conforming to explainability contract', async () => {
    const res = await controller.getOpportunityRadar(portfolioId, principal);
    expect(res).toHaveProperty('data');
    const { data } = res;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(data.totalEligible).toBe(2);
    expect(data.totalRanked).toBe(2);
    expect(data.items.length).toBe(2);
    expect(data.disclaimer).toContain('Radar informativo');

    const item = data.items[0];
    expect(item).toHaveProperty('ticker');
    expect(item).toHaveProperty('score');
    expect(item.score).toBeGreaterThanOrEqual(0);
    expect(item.score).toBeLessThanOrEqual(100);
    expect(item).toHaveProperty('confidence');
    expect(item).toHaveProperty('components');
    expect(item.positives.length).toBeGreaterThanOrEqual(1);
    expect(item.risks.length).toBeGreaterThanOrEqual(1);
  });

  // 2. Cache behavior
  it('2. subsequent GET calls return cached response without re-executing valuation', async () => {
    const res1 = await controller.getOpportunityRadar(portfolioId, principal);
    expect(mockValuationUseCase.execute).toHaveBeenCalledTimes(1);

    const res2 = await controller.getOpportunityRadar(portfolioId, principal);
    expect(mockValuationUseCase.execute).toHaveBeenCalledTimes(1); // Not called again!
    expect(res2.data.updatedAt).toBe(res1.data.updatedAt);
  });

  // 3. POST /refresh forces recalculation
  it('3. POST /refresh invalidates cache and triggers new evaluation', async () => {
    await controller.getOpportunityRadar(portfolioId, principal);
    expect(mockValuationUseCase.execute).toHaveBeenCalledTimes(1);

    const refreshRes = await controller.refreshOpportunityRadar(portfolioId, principal);
    expect(mockValuationUseCase.execute).toHaveBeenCalledTimes(2); // Called again!
    expect(refreshRes.data.items.length).toBe(2);
  });

  // 4. Anti-enumeration: returns 404 for portfolio belonging to another user
  it('4. accessing non-owned portfolio throws NotFoundException (404 anti-enumeration)', async () => {
    const otherUser = { userId: 'attacker-id', sessionId: 'sess-2' } as any;

    await expect(controller.getOpportunityRadar(portfolioId, otherUser)).rejects.toThrow(NotFoundException);
    await expect(controller.refreshOpportunityRadar(portfolioId, otherUser)).rejects.toThrow(NotFoundException);
  });

  // 5. Inexistent portfolio returns 404
  it('5. non-existent portfolioId throws NotFoundException', async () => {
    await expect(
      controller.getOpportunityRadar('00000000-0000-4000-8000-999999999999', principal),
    ).rejects.toThrow(NotFoundException);
  });
});
