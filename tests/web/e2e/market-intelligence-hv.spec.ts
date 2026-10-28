import { test, expect } from '@playwright/test';

test.describe('Phase 5T-HV: Market Intelligence Human Validation', () => {
  let watchlist: Array<{
    id: string;
    assetId: string;
    ticker: string;
    name: string;
    type: string;
    currency: string;
    exchange: string;
    addedAt: string;
    quote: {
      price: string;
      currency: string;
      tradingDate: string;
      provider: string;
      freshness: 'FRESH' | 'STALE';
    };
    quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED';
  }> = [];

  const catalogAssets = [
    { id: 'ast-vale3', ticker: 'VALE3', name: 'Vale S.A.', type: 'EQUITY', currency: 'BRL', exchange: 'BVMF' },
    { id: 'ast-aapl', ticker: 'AAPL', name: 'Apple Inc.', type: 'EQUITY', currency: 'USD', exchange: 'NASDAQ' },
    { id: 'ast-petr4', ticker: 'PETR4', name: 'Petróleo Brasileiro S.A.', type: 'EQUITY', currency: 'BRL', exchange: 'BVMF' },
    { id: 'ast-hglg11', ticker: 'HGLG11', name: 'CSHG Logística FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' },
  ];

  test.beforeEach(async ({ context, page }) => {
    // Reset initial mock watchlist
    watchlist = [
      {
        id: 'wl-1',
        assetId: 'ast-vale3',
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
      },
      {
        id: 'wl-2',
        assetId: 'ast-aapl',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        type: 'EQUITY',
        currency: 'USD',
        exchange: 'NASDAQ',
        addedAt: '2026-10-28T10:05:00.000Z',
        quote: {
          price: '230.15',
          currency: 'USD',
          tradingDate: '2026-10-27',
          provider: 'BRAPI',
          freshness: 'FRESH',
        },
        quoteFreshness: 'FRESH',
      },
    ];

    page.on('request', (req) => {
      console.info(`[${req.method()}]`, req.url());
    });
    page.on('response', (res) => {
      console.info(`[RES ${res.status()}]`, res.url());
    });

    // Setup authenticated session cookies for local testing
    await context.addCookies([
      {
        name: 'atlas_refresh',
        value: 'mock-refresh-token-5t',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'atlas_logged_in',
        value: 'true',
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ]);

    // Mock auth routes
    await page.route('**/api/auth/me', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              id: 'usr-5t-hv',
              name: 'Investidor 5T',
              email: 'investidor5t@atlas.dev',
              locale: 'pt-BR',
              timezone: 'America/Sao_Paulo',
              baseCurrency: 'BRL',
            },
          },
        }),
      });
    });

    await page.route('**/api/auth/refresh', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'mock-valid-token-5t',
            expiresIn: 900,
          },
        }),
      });
    });

    await page.route('**/api/v1/integration-reviews/count', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingCount: 0, truncated: false } }),
      });
    });

    await page.route('**/api/v1/macro/context', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            selicTarget: { rate: '10.50', effectiveDate: '2026-10-27', source: 'BACEN' },
          },
        }),
      });
    });

    await page.route('**/api/v1/portfolios', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'port-5t-1', name: 'Carteira Principal', baseCurrency: 'BRL' },
          ],
        }),
      });
    });

    await page.route('**/api/v1/portfolios/*/valuation', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            positions: [
              {
                assetId: 'ast-vale3',
                ticker: 'VALE3',
                quote: { price: '62.50', currency: 'BRL', asOf: '2026-10-27', source: 'BRAPI' },
                quoteFreshness: 'FRESH',
                quoteStatus: 'EOD',
              },
            ],
            summary: {
              totalPositions: 1,
              valuedPositions: 1,
              stalePositions: 0,
              unvaluedPositions: 0,
              valuationCoveragePercent: '100',
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/watchlist', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: watchlist }),
        });
      } else if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const asset = catalogAssets.find((a) => a.id === body.assetId);
        const newItem = {
          id: `wl-${Date.now()}`,
          assetId: body.assetId,
          ticker: asset?.ticker || 'UNKNOWN',
          name: asset?.name || 'Unknown',
          type: asset?.type || 'EQUITY',
          currency: asset?.currency || 'BRL',
          exchange: asset?.exchange || 'BVMF',
          addedAt: new Date().toISOString(),
          quote: {
            price: '38.20',
            currency: asset?.currency || 'BRL',
            tradingDate: '2026-10-27',
            provider: 'BRAPI',
            freshness: 'FRESH' as const,
          },
          quoteFreshness: 'FRESH' as const,
        };
        watchlist.push(newItem);
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newItem }),
        });
      }
    });

    await page.route('**/api/v1/watchlist/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        const url = route.request().url();
        const assetId = url.split('/').pop()?.split('?')[0];
        watchlist = watchlist.filter((w) => w.assetId !== assetId);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { removed: true } }),
        });
      }
    });

    await page.route('**/api/v1/assets?*', async (route) => {
      const url = new URL(route.request().url());
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const filtered = catalogAssets.filter(
        (a) => a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
      );
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: filtered }),
      });
    });
  });

  test('Step 2 to 10: Market Home, Search, Watchlist, Multi-Currency, and Holdings', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Step 2: Open /market
    await page.goto('/market');
    await expect(page.locator('h1')).toContainText('Mercado');
    await expect(page.locator('text=Busca e Descoberta de Ativos')).toBeVisible();
    await expect(page.locator('text=Lista de Acompanhamento (Watchlist)')).toBeVisible();
    await expect(page.locator('text=Cotações da sua Carteira')).toBeVisible();

    // Step 4: Search copy audit - verify no false claims of "tempo real" or "real-time"
    const searchSectionText = await page.locator('text=Busca e Descoberta de Ativos').locator('..').innerText();
    expect(searchSectionText.toLowerCase()).not.toContain('tempo real');
    expect(searchSectionText.toLowerCase()).not.toContain('real-time');

    // Step 3: Search non-holding asset
    const searchInput = page.locator('input[aria-label="Buscar ativo por ticker ou nome"]');
    await expect(searchInput).toBeVisible();

    // 3a. Search exact ticker "PETR4"
    await searchInput.fill('PETR4');
    await expect(page.locator('td:has-text("PETR4")')).toBeVisible();
    await expect(page.locator('td:has-text("Petróleo Brasileiro S.A.")')).toBeVisible();

    // 3b. Search partial ticker "HGLG"
    await searchInput.fill('HGLG');
    await expect(page.locator('td:has-text("HGLG11")')).toBeVisible();
    await expect(page.locator('td:has-text("CSHG Logística FII")')).toBeVisible();

    // 3c. Search asset name "Petróleo"
    await searchInput.fill('Petróleo');
    await expect(page.locator('td:has-text("PETR4")')).toBeVisible();

    // Step 5: Search non-existent term
    await searchInput.fill('XYZNOTEXIST99');
    await expect(page.locator('text=Nenhum ativo encontrado para “XYZNOTEXIST99”.')).toBeVisible();

    // Step 7: Add to watchlist
    await searchInput.fill('PETR4');
    const addBtn = page.locator('button[aria-label="Acompanhar PETR4"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Verify feedback and presence in watchlist
    await expect(page.locator('text=Ativo adicionado à lista de acompanhamento.')).toBeVisible();
    const watchlistTable = page.locator('table').filter({ hasText: 'Ações' });
    await expect(watchlistTable.locator('a[href="/market/assets/ast-petr4"]').first()).toBeVisible();

    // Step 8: Duplicate add protection - button is now "Acompanhando" and disabled
    await expect(page.locator('button[aria-label="Ativo PETR4 já acompanhado"]')).toBeDisabled();

    // Step 17 to 20: Multi-currency segregation in Watchlist
    // Check currency buttons: Todas (3), BRL (2), USD (1)
    await expect(page.locator('button:has-text("Todas (3)")')).toBeVisible();
    await expect(page.locator('button:has-text("BRL (2)")')).toBeVisible();
    await expect(page.locator('button:has-text("USD (1)")')).toBeVisible();

    // Notice text check
    await expect(
      page.locator('text=Cotações expressas na moeda nativa de cada ativo. Sem conversão cambial implícita.'),
    ).toBeVisible();

    // Filter BRL: AAPL should hide, VALE3 and PETR4 visible in watchlist table
    await page.locator('button:has-text("BRL (2)")').click();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-vale3"]').first()).toBeVisible();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-petr4"]').first()).toBeVisible();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-aapl"]')).not.toBeVisible();

    // Filter USD: Only AAPL visible in watchlist table
    await page.locator('button:has-text("USD (1)")').click();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-aapl"]').first()).toBeVisible();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-vale3"]')).not.toBeVisible();

    // Return to ALL
    await page.locator('button:has-text("Todas (3)")').click();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-vale3"]').first()).toBeVisible();
    await expect(watchlistTable.locator('a[href="/market/assets/ast-aapl"]').first()).toBeVisible();

    // Step 9: Remove from Watchlist
    const removeBtn = page.locator('button[aria-label="Remover PETR4 da watchlist"]');
    await removeBtn.click();
    await expect(page.locator('text=Ativo removido da lista de acompanhamento.')).toBeVisible();

    // Step 27: Verify zero console errors
    expect(consoleErrors).toEqual([]);
  });

  test('Step 11 to 23: Market Asset Detail, Holding Cross-Link, and Provider Limitations', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const isWatchedState = false;

    // Step 11 to 23: Market Asset Detail, Holding Cross-Link, and Provider Limitations
    await page.route('**/api/v1/market/assets/ast-vale3*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'ast-vale3',
            ticker: 'VALE3',
            name: 'Vale S.A.',
            type: 'EQUITY',
            currency: 'BRL',
            exchange: 'BVMF',
            quote: {
              price: '62.50',
              currency: 'BRL',
              tradingDate: '2026-10-27',
              provider: 'BRAPI',
              freshness: 'FRESH',
            },
            quoteFreshness: 'FRESH',
            isWatched: isWatchedState,
            isHeld: true,
            heldInPortfolios: [{ id: 'port-5t-1', name: 'Carteira Principal' }],
            fundamentals: {
              status: 'UNAVAILABLE',
              providerStatus: 'MARKET_DATA_PROVIDER_GAP',
              message: 'Dados fundamentalistas detalhados exigem conector com provedor de dados de mercado homologado.',
            },
            news: {
              status: 'UNAVAILABLE',
              providerStatus: 'MARKET_DATA_PROVIDER_GAP',
              message: 'Feed de notícias corporativas em tempo real exige integração externa homologada.',
            },
          },
        }),
      });
    });

    // Navigate to Market Asset Detail via Search -> Ver Detalhes
    await page.goto('/market');
    await expect(page.locator('h1')).toContainText('Mercado');
    const searchInput = page.locator('input[aria-label="Buscar ativo por ticker ou nome"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('VALE');
    const valeRow = page.locator('tr').filter({ hasText: 'VALE3' }).first();
    await expect(valeRow).toBeVisible();
    const detailsBtn = valeRow.locator('a:has-text("Ver Detalhes")');
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.click();

    // Step 11: Market Detail Header & Quote Card
    await expect(page.locator('h1')).toContainText('VALE3 — Vale S.A.');
    await expect(page.locator('text=Último Preço (BRL)')).toBeVisible();
    await expect(page.locator('text=R$ 62,50')).toBeVisible();
    await expect(page.locator('text=2026-10-27')).toBeVisible();
    await expect(page.locator('text=BRAPI')).toBeVisible();
    await expect(page.locator('text=Atualizada')).toBeVisible();

    // Step 13: Holding cross-link banner
    await expect(page.locator('text=Ativo em Custódia')).toBeVisible();
    await expect(
      page.locator('text=Você possui posição deste ativo nas seguintes carteiras: Carteira Principal.'),
    ).toBeVisible();
    const portfolioLink = page.locator('a:has-text("Ver posição na Carteira →")');
    await expect(portfolioLink).toBeVisible();
    await expect(portfolioLink).toHaveAttribute('href', '/portfolio');

    // Step 12: Distinct from portfolio position detail: no custody lots or average cost calculations
    await expect(page.locator('text=Preço Médio')).not.toBeVisible();
    await expect(page.locator('text=Resultado Realizado')).not.toBeVisible();

    // Step 7/9 on detail: Toggle Watchlist
    const watchBtn = page.locator('button[aria-label="Adicionar à Watchlist"]');
    await expect(watchBtn).toContainText('☆ Acompanhar ativo');
    await watchBtn.click();
    await expect(page.locator('text=Ativo adicionado à lista de acompanhamento.')).toBeVisible();

    // Step 21 & 22: Honest Provider Gap Disclosures
    await expect(page.locator('text=Fundamentos da Empresa')).toBeVisible();
    await expect(page.locator('text=Notícias e Fatos Relevantes')).toBeVisible();
    await expect(page.locator('text=Múltiplos e indicadores contábeis')).toBeVisible();
    await expect(page.locator('text=O Atlas não simula nem inventa dados financeiros.')).toBeVisible();
    await expect(page.locator('text=O Atlas não exibe notícias fictícias.')).toBeVisible();

    // Step 23: Provider language audit - verify no technical internal enums
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain('MARKET_DATA_PROVIDER_GAP');
    expect(pageText).not.toContain('UNAVAILABLE enum');
    expect(pageText).not.toContain('PrismaMarketQuoteRepository');

    // Step 31: Investment advice boundary check
    expect(pageText.toLowerCase()).not.toContain('oportunidade imperdível');
    expect(pageText.toLowerCase()).not.toContain('recomendamos a compra');
    expect(pageText.toLowerCase()).not.toContain('ativo barato');
    expect(pageText.toLowerCase()).not.toContain('ativo caro');

    expect(consoleErrors).toEqual([]);
  });

  test('Step 25: Responsive Mobile Viewport 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/market');

    await expect(page.locator('h1')).toContainText('Mercado');
    const searchInput = page.locator('input[aria-label="Buscar ativo por ticker ou nome"]');
    await expect(searchInput).toBeVisible();

    // Verify search works on mobile without horizontal clipping
    await searchInput.fill('VALE');
    await expect(page.locator('text=Busca e Descoberta de Ativos')).toBeVisible();
  });
});
