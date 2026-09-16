import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';
import { CANONICAL_NAV_ITEMS, PROFILE_NAV_ITEM } from '@atlas/ui';
import { apiClient } from '@/api/client';

interface PortfolioItem {
  id: string;
  name: string;
  baseCurrency?: string;
  currency?: string;
  type: string;
}

describe('Product Shell & Onboarding Foundation', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(
      {
        id: 'usr-1',
        name: 'Carlos Investor',
        email: 'carlos@atlas.dev',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
      'fake-token-123',
    );
    vi.restoreAllMocks();
  });

  describe('Canonical Navigation Model', () => {
    it('should match all 5 canonical routes in exact order', () => {
      const paths = CANONICAL_NAV_ITEMS.map((item) => item.path);
      expect(paths).toEqual(['/today', '/portfolio', '/market', '/tax', '/ai']);
    });

    it('should keep profile navigation outside main tab list', () => {
      expect(PROFILE_NAV_ITEM.path).toBe('/profile');
    });
  });

  describe('Onboarding State Derivation', () => {
    it('should derive onboarding required when user has 0 portfolios', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await apiClient.get<{ data: PortfolioItem[] }>('/api/v1/portfolios');
      const shouldShowOnboarding = res.data.length === 0;

      expect(shouldShowOnboarding).toBe(true);
    });

    it('should derive onboarding bypassed when user already has at least 1 portfolio', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'port-1',
              name: 'Carteira Principal',
              baseCurrency: 'BRL',
              type: 'PERSONAL',
            },
          ],
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await apiClient.get<{ data: PortfolioItem[] }>('/api/v1/portfolios');
      const shouldShowOnboarding = res.data.length === 0;

      expect(shouldShowOnboarding).toBe(false);
    });
  });

  describe('Portfolio Creation in Onboarding', () => {
    it('should create initial portfolio and support valid portfolio types', async () => {
      const payload = {
        name: 'Minha Primeira Carteira',
        currency: 'BRL',
        type: 'PERSONAL',
      };

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'port-first',
            ...payload,
          },
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await apiClient.post<{ data: PortfolioItem }>('/api/v1/portfolios', payload);
      expect(res.data.id).toBe('port-first');
      expect(res.data.name).toBe('Minha Primeira Carteira');
    });
  });
});
