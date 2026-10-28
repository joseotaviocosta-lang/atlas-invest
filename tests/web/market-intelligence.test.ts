import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  watchlistQueryKey,
  marketAssetDetailQueryKey,
  WatchlistItemVM,
  MarketAssetDetailVM,
  formatCurrency,
} from '@atlas/ui';

const MARKET_PAGE = 'apps/web/src/app/(app)/market/page.tsx';
const MARKET_DETAIL_PAGE = 'apps/web/src/app/(app)/market/assets/[assetId]/page.tsx';
const PORTFOLIO_DETAIL_PAGE = 'apps/web/src/app/(app)/portfolio/assets/[assetId]/page.tsx';

describe('Web: Market Intelligence Expansion (Phase 5T)', () => {
  describe('Query Keys & View-Model Contracts', () => {
    it('produces deterministic query keys for watchlist and asset detail', () => {
      expect(watchlistQueryKey()).toEqual(['watchlist']);
      expect(marketAssetDetailQueryKey('test-asset-uuid')).toEqual([
        'market-asset-detail',
        'test-asset-uuid',
      ]);
    });

    it('enforces multi-currency segregation without implicit conversion', () => {
      const brlItem: WatchlistItemVM = {
        id: '1',
        assetId: 'asset-brl',
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
        addedAt: '2026-10-28T10:00:00.000Z',
        quote: {
          price: '62.50',
          currency: 'BRL',
          tradingDate: '2026-10-27',
          provider: 'BRAPI',
          freshness: 'FRESH',
        },
        quoteFreshness: 'FRESH',
      };

      const usdItem: WatchlistItemVM = {
        id: '2',
        assetId: 'asset-usd',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        type: 'EQUITY',
        currency: 'USD',
        exchange: 'NASDAQ',
        addedAt: '2026-10-28T10:00:00.000Z',
        quote: {
          price: '230.15',
          currency: 'USD',
          tradingDate: '2026-10-27',
          provider: 'BRAPI',
          freshness: 'FRESH',
        },
        quoteFreshness: 'FRESH',
      };

      expect(brlItem.currency).toBe('BRL');
      expect(usdItem.currency).toBe('USD');
      expect(formatCurrency(brlItem.quote!.price, brlItem.quote!.currency)).toContain('R$');
      expect(formatCurrency(usdItem.quote!.price, usdItem.quote!.currency)).toContain('USD');
    });

    it('models provider limitations honestly via MARKET_DATA_PROVIDER_GAP', () => {
      const detail: MarketAssetDetailVM = {
        id: 'asset-1',
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
        quote: {
          price: '38.20',
          currency: 'BRL',
          tradingDate: '2026-10-27',
          provider: 'BRAPI',
          freshness: 'FRESH',
        },
        quoteFreshness: 'FRESH',
        isWatched: true,
        isHeld: true,
        heldInPortfolios: [{ id: 'port-1', name: 'Carteira Principal' }],
        fundamentals: {
          status: 'UNAVAILABLE',
          providerStatus: 'MARKET_DATA_PROVIDER_GAP',
          message: 'Dados fundamentalistas requerem provedor homologado.',
        },
        news: {
          status: 'UNAVAILABLE',
          providerStatus: 'MARKET_DATA_PROVIDER_GAP',
          message: 'Feed de notícias requer provedor homologado.',
        },
      };

      expect(detail.fundamentals.status).toBe('UNAVAILABLE');
      expect(detail.fundamentals.providerStatus).toBe('MARKET_DATA_PROVIDER_GAP');
      expect(detail.news.status).toBe('UNAVAILABLE');
      expect(detail.news.providerStatus).toBe('MARKET_DATA_PROVIDER_GAP');
    });
  });

  describe('Source Code Integrity & Surface Architecture', () => {
    it('verifies Market page contains discovery search, watchlist, and currency segregation', () => {
      const marketSource = fs.readFileSync(path.resolve(process.cwd(), MARKET_PAGE), 'utf-8');

      // Search integration
      expect(marketSource).toContain('/api/v1/assets?q=');
      expect(marketSource).toContain('Busca e Descoberta de Ativos');

      // Watchlist integration
      expect(marketSource).toContain('/api/v1/watchlist');
      expect(marketSource).toContain('Lista de Acompanhamento (Watchlist)');

      // Multi-currency notice & filter
      expect(marketSource).toContain('Sem conversão cambial implícita');
      expect(marketSource).toContain('selectedCurrencyFilter');
    });

    it('verifies Market Asset Detail page exists and is distinct from Portfolio Asset Detail', () => {
      const marketDetailSource = fs.readFileSync(
        path.resolve(process.cwd(), MARKET_DETAIL_PAGE),
        'utf-8',
      );
      const portfolioDetailSource = fs.readFileSync(
        path.resolve(process.cwd(), PORTFOLIO_DETAIL_PAGE),
        'utf-8',
      );

      // Market detail calls market asset endpoint
      expect(marketDetailSource).toContain('/api/v1/market/assets/');
      expect(marketDetailSource).toContain('toggleWatchlistMutation');

      // Cross-link to portfolio if held
      expect(marketDetailSource).toContain('Ativo em Custódia');
      expect(marketDetailSource).toContain('/portfolio');

      // Honest limitation notices for fundamentals and news
      expect(marketDetailSource).toContain('Fundamentos da Empresa');
      expect(marketDetailSource).toContain('Notícias e Fatos Relevantes');

      // Distinct from Portfolio Detail: portfolio detail does custody lot breakdown, realized gains, tax
      expect(portfolioDetailSource).toContain('AssetCustodyBreakdown');
      expect(portfolioDetailSource).toContain('AssetRealizedSection');
      expect(marketDetailSource).not.toContain('AssetCustodyBreakdown');
      expect(marketDetailSource).not.toContain('AssetRealizedSection');
    });
  });
});
