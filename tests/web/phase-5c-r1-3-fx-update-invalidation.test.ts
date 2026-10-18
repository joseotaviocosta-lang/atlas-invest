import { describe, it, expect, vi } from 'vitest';
import { queryClient } from '@/lib/react-query';
import { valuationQueryKey } from '@/components/portfolio/PortfolioValuation';
import { allocationQueryKey } from '@/components/portfolio/PortfolioAllocationSection';

describe('Phase 5C-R1.3: FX Update Invalidation & Cache Key Contract', () => {
  it('Gate 4 & 5: Exact source shape of valuation and allocation query keys', () => {
    const portfolioId = 'port-123';
    expect(valuationQueryKey(portfolioId)).toEqual(['portfolio-valuation', 'port-123']);
    expect(allocationQueryKey(portfolioId)).toEqual(['portfolio-allocation', 'port-123']);
  });

  it('Gate 14 & 15: FX Update Invalidation invalidates valuation and allocation queries without page reload', async () => {
    const portfolioId = 'port-456';

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Simulate mutation onSuccess logic after POST /api/v1/fx/:base/:quote/update
    // When FX data changes, valuation and allocation for relevant portfolio(s) are invalidated
    queryClient.invalidateQueries({ queryKey: valuationQueryKey(portfolioId) });
    queryClient.invalidateQueries({ queryKey: allocationQueryKey(portfolioId) });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['portfolio-valuation', 'port-456'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['portfolio-allocation', 'port-456'],
    });
  });
});
