import { test, expect } from '@playwright/test';

test.describe('Phase 5W-R1: UX Consistency & Human Validation Suite', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'atlas_refresh',
        value: 'mock-refresh-token',
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

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'mock-refreshed-token',
            expiresIn: 900,
          },
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              id: 'usr-e2e-1',
              name: 'Investidor 5W',
              email: 'investidor5w@atlas.dev',
              locale: 'pt-BR',
              timezone: 'America/Sao_Paulo',
              baseCurrency: 'BRL',
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/portfolios', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'port-1', name: 'Carteira Principal', currency: 'BRL', type: 'PERSONAL' },
            { id: 'port-2', name: 'Carteira Familiar', currency: 'BRL', type: 'FAMILY' },
          ],
        }),
      });
    });

    await page.route('**/api/v1/portfolios/port-1/integrations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            portfolioId: 'port-1',
            sources: [
              {
                source: 'B3',
                status: 'CONNECTED',
                availability: 'AVAILABLE',
                connection: {
                  state: 'AUTHORIZED',
                  lifecycle: 'ACTIVE',
                  authorizedAt: '2026-10-28T10:00:00Z',
                },
                lastRun: null,
                availableActions: ['SYNC_NOW'],
              },
            ],
          },
        }),
      });
    });

    await page.route('**/api/v1/portfolios/port-1/imports/schedules', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/v1/portfolios/port-1/imports/runs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'run-101',
              portfolioId: 'port-1',
              source: 'MANUAL_CSV',
              provider: 'XP',
              environment: 'PRODUCTION',
              fileName: 'notas-2026.csv',
              sourceAsOf: '2026-10-28T12:00:00Z',
              createdAt: '2026-10-28T12:00:00Z',
              trigger: 'MANUAL',
              status: 'AWAITING_REVIEW',
              counts: {
                fetched: 10,
                normalized: 10,
                new: 8,
                exactDuplicates: 1,
                probableDuplicates: 1,
                conflicts: 0,
                unsupported: 0,
                invalid: 0,
                confirmed: 0,
                ignored: 0,
              },
              reconciliation: null,
              partial: false,
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/portfolios/*/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'acc-1', name: 'Corretora XP' }],
        }),
      });
    });

    await page.route('**/api/v1/assets*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'ast-petr4', ticker: 'PETR4', name: 'Petrobras' },
            { id: 'ast-vale3', ticker: 'VALE3', name: 'Vale' },
          ],
        }),
      });
    });

    await page.route('**/api/v1/integration-reviews/count', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingCount: 1, truncated: false } }),
      });
    });

    await page.route('**/api/v1/integration-reviews*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'rev-1',
              runId: 'run-101',
              portfolioId: 'port-1',
              status: 'PENDING',
              createdAt: '2026-10-28T12:00:00Z',
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/integration-reviews/run-101', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            item: {
              id: 'rev-1',
              runId: 'run-101',
              portfolioId: 'port-1',
              portfolioName: 'Carteira Principal',
              source: 'MANUAL_CSV',
              trigger: 'MANUAL',
              status: 'PENDING',
              severity: 'ATTENTION',
              reasonCodes: [],
              metrics: {
                newRecords: 8,
                probableDuplicates: 1,
                conflicts: 0,
                unsupported: 0,
                invalid: 0,
                divergent: 0,
                missingLocal: 0,
                missingSource: 0,
                unresolved: 0,
                partial: false,
              },
              createdAt: '2026-10-28T12:00:00Z',
            },
            state: 'ACTIONABLE',
            resolvedReason: null,
            portfolioName: 'Carteira Principal',
            limitations: [],
            linkedTransactions: [],
            linkedTransactionsTruncated: false,
            pairReview: {
              status: 'READY',
              items: [],
            },
          },
        }),
      });
    });
  });

  test('Desktop & Mobile: PortfolioSwitcher localization, touch target and Escape focus return', async ({
    page,
  }) => {
    await page.goto('/today');
    await expect(page.locator('h1')).toContainText('Hoje');

    const switcherTrigger = page.locator('button[aria-haspopup="listbox"]');
    await expect(switcherTrigger).toBeVisible();

    // Check minimum touch target
    const box = await switcherTrigger.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    // Open switcher
    await switcherTrigger.click();
    await expect(page.locator('div[role="listbox"]')).toBeVisible();

    // Verify localized labels (never raw enum PERSONAL or FAMILY)
    await expect(
      page.locator('div[role="listbox"]').getByText('Pessoal', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('div[role="listbox"]').getByText('Familiar', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('div[role="listbox"]').getByText('PERSONAL')).toHaveCount(0);
    await expect(page.locator('div[role="listbox"]').getByText('FAMILY')).toHaveCount(0);

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify closed and trigger focused
    await expect(page.locator('div[role="listbox"]')).not.toBeVisible();
    await expect(switcherTrigger).toBeFocused();
  });

  test('Import Hub: segmented tabs eliminate vertical density, deep link works cleanly', async ({
    page,
  }) => {
    // Normal visit to /portfolio/import
    await page.goto('/portfolio/import');
    await expect(page.locator('h1')).toContainText('Importar carteira');

    // 3 Segmented tabs visible
    const importTab = page.locator('button[role="tab"]:has-text("Importar Arquivo")');
    const syncTab = page.locator('button[role="tab"]:has-text("Sincronização B3")');
    const historyTab = page.locator('button[role="tab"]:has-text("Histórico de Importações")');

    await expect(importTab).toBeVisible();
    await expect(syncTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    // Switch to Sincronização B3
    await syncTab.click();
    await expect(page.getByText('Conexão B3')).toBeVisible();

    // Switch to Histórico de Importações
    await historyTab.click();
    await expect(page.locator('h2:has-text("Histórico de importações")')).toBeVisible();

    // Deep link test
    await page.goto('/portfolio/import?runId=run-101');
    await expect(
      page.locator('button[role="tab"]:has-text("Histórico de Importações")'),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('h2:has-text("Histórico de importações")')).toBeVisible();
  });

  test('Review Detail: Top return navigation is explicit and functional', async ({ page }) => {
    await page.goto('/reviews/run-101');
    const returnLink = page.locator('a[aria-label="Voltar para Fila de Revisão"]');
    await expect(returnLink).toBeVisible();
    await expect(returnLink).toContainText('Voltar para Fila de Revisão');
    await returnLink.click();
    await expect(page).toHaveURL(/.*reviews/);
  });

  test('Viewport horizontal overflow check across surfaces', async ({ page }) => {
    const testRoutes = [
      '/today',
      '/portfolio/import',
      '/reviews',
      '/tax',
      '/market',
      '/ai',
      '/profile',
    ];
    for (const route of testRoutes) {
      await page.goto(route);
      const isOverflown = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflown, `Horizontal overflow detected on ${route}`).toBe(false);
    }
  });
});
