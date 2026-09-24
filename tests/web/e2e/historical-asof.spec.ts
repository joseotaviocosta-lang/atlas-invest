import { test, expect, type Page } from '@playwright/test';

const CURRENT_STATE = {
  portfolioId: 'port-1',
  asOfDate: null,
  completeness: { costBasis: 'COMPLETE' },
  positions: [
    {
      assetId: 'PETR4',
      quantity: '100',
      currency: 'BRL',
      costBasisStatus: 'KNOWN',
      totalCost: { amount: '3200.00', currency: 'BRL' },
      averageCost: { amount: '32.00', currency: 'BRL' },
    },
  ],
  accounts: [
    {
      accountId: 'acc-1',
      positions: [
        {
          assetId: 'PETR4',
          quantity: '100',
          currency: 'BRL',
          costBasisStatus: 'KNOWN',
          totalCost: { amount: '3200.00', currency: 'BRL' },
          averageCost: { amount: '32.00', currency: 'BRL' },
        },
      ],
    },
  ],
  realizedSummaries: [],
  incomeSummaries: [],
  cashFlowSummaries: [],
  replayMetadata: {
    engineVersion: '1.0.0-rc.1',
    asOfDate: null,
    processedTransactionCount: 2,
    appliedTransactionCount: 2,
    deferredTransactionCount: 0,
    hasIncompleteCostBasis: false,
  },
};

const HISTORICAL_STATE = {
  ...CURRENT_STATE,
  asOfDate: '2026-01-15',
  positions: [],
  accounts: [],
  replayMetadata: {
    engineVersion: '1.0.0-rc.1',
    asOfDate: '2026-01-15',
    processedTransactionCount: 0,
    appliedTransactionCount: 0,
    deferredTransactionCount: 0,
    hasIncompleteCostBasis: false,
  },
};

test.describe('Historical As-Of UX & Portfolio Time Travel (Fase 2F)', () => {
  test.beforeEach(async ({ context, page }) => {
    let currentUser: Record<string, string> | null = null;

    await page.route('**/api/auth/login', async (route) => {
      currentUser = {
        id: 'usr-e2e-1',
        name: 'Investidor E2E',
        email: 'e2e@atlas.dev',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      };
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { user: currentUser, accessToken: 'mock-access-token', expiresIn: 900 },
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      if (!currentUser) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'AUTH.UNAUTHORIZED', message: 'Not logged in' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: currentUser }),
        });
      }
    });

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: 'mock-refreshed-token', expiresIn: 900 } }),
      });
    });

    await page.route('**/api/v1/portfolios', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'port-1',
              name: 'Carteira E2E',
              baseCurrency: 'BRL',
              type: 'PERSONAL',
              status: 'ACTIVE',
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/portfolios', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'port-1',
              name: 'Carteira E2E',
              baseCurrency: 'BRL',
              type: 'PERSONAL',
              status: 'ACTIVE',
            },
          ],
        }),
      });
    });

    // Server replay: historical snapshot when asOf is present, current otherwise.
    await page.route('**/api/v1/portfolios/*/state*', async (route) => {
      const url = route.request().url();
      const historical = url.includes('asOf=2026-01-15');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: historical ? HISTORICAL_STATE : CURRENT_STATE }),
      });
    });

    await page.route('**/api/v1/portfolios/*/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'acc-1',
              portfolioId: 'port-1',
              institutionId: 'inst-1',
              name: 'Corretora XP',
              currency: 'BRL',
              status: 'ACTIVE',
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/institutions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'inst-1', name: 'XP Investimentos' }] }),
      });
    });

    await page.route('**/api/v1/assets*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'PETR4',
            ticker: 'PETR4',
            name: 'Petróleo Brasileiro S.A.',
            type: 'EQUITY',
            currency: 'BRL',
          },
        }),
      });
    });

    await page.route('**/api/v1/portfolios/*/history*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { limit: 20, cursor: null, nextCursor: null, hasMore: false, totalCount: 0 },
        }),
      });
    });
  });

  async function login(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e@atlas.dev');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*today/);
  }

  test('Time travel via date selector: current → past snapshot → back to today', async ({
    page,
  }) => {
    await login(page);

    // Current mode shows the live position.
    await page.goto('/portfolio');
    await expect(page.locator('text=PETR4').first()).toBeVisible();
    await expect(page.getByText('Visualizando carteira em', { exact: false })).toHaveCount(0);

    // Pick a past date: banner appears and the empty historical snapshot renders.
    await page.getByLabel('Data da carteira').fill('2026-01-15');
    await expect(page.getByText('Visualizando carteira em 15/01/2026')).toBeVisible();
    await expect(page.getByText('Nenhuma posição nesta data')).toBeVisible();
    await expect(page).toHaveURL(/asOf=2026-01-15/);

    // Back to today clears the param and restores current data.
    await page.getByRole('button', { name: 'Voltar para hoje' }).click();
    await expect(page).not.toHaveURL(/asOf=/);
    await expect(page.locator('text=PETR4').first()).toBeVisible();
  });

  test('Deep link preserves asOf across asset detail', async ({ page }) => {
    await login(page);

    await page.goto('/portfolio/assets/PETR4?portfolioId=port-1&asOf=2026-01-15');
    await expect(page.getByText('Visualizando carteira em 15/01/2026')).toBeVisible();
    await expect(
      page.getByText('Este ativo não fazia parte da carteira nesta data.'),
    ).toBeVisible();

    const backHref = await page.locator('a:has-text("Voltar para Carteira")').getAttribute('href');
    expect(backHref).toContain('asOf=2026-01-15');
  });

  test('Deep link preserves asOf across account detail', async ({ page }) => {
    await login(page);

    await page.goto('/portfolio/accounts?portfolioId=port-1&asOf=2026-01-15');
    await expect(page.getByText('Visualizando carteira em 15/01/2026')).toBeVisible();
    await expect(page.getByText('Corretora XP')).toBeVisible();

    await page.getByRole('link', { name: /Ver detalhes da conta/ }).click();
    await expect(page).toHaveURL(/asOf=2026-01-15/);
    await expect(page.getByText('Visualizando carteira em 15/01/2026')).toBeVisible();
    await expect(page.getByText('Nenhuma posição nesta data')).toBeVisible();
  });
});
