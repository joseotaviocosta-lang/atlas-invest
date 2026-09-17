import { test, expect } from '@playwright/test';

interface E2EUser {
  id: string;
  name: string;
  email: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
}

interface E2EPortfolio {
  id: string;
  name: string;
  currency: string;
  type: string;
}

test.describe('Product Shell & Canonical End-to-End Suite', () => {
  test.beforeEach(async ({ context, page }) => {
    // Intercept backend auth & portfolio APIs for deterministic browser testing
    let currentUser: E2EUser | null = null;
    const portfolios: E2EPortfolio[] = [];

    await page.route('**/api/auth/register', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      currentUser = {
        id: 'usr-e2e-1',
        name: body.name || 'Investidor E2E',
        email: body.email || 'e2e@atlas.dev',
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
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: currentUser,
            accessToken: 'mock-access-token',
            expiresIn: 900,
          },
        }),
      });
    });

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
          data: {
            user: currentUser,
            accessToken: 'mock-access-token',
            expiresIn: 900,
          },
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
        body: JSON.stringify({
          data: {
            accessToken: 'mock-refreshed-token',
            expiresIn: 900,
          },
        }),
      });
    });

    await page.route('**/api/auth/logout', async (route) => {
      currentUser = null;
      await context.clearCookies();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      });
    });

    await page.route('**/api/v1/portfolios', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: portfolios }),
        });
      } else if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const newPort = {
          id: `port-${portfolios.length + 1}`,
          userId: currentUser?.id || 'usr-e2e-1',
          name: body.name || 'Carteira E2E',
          baseCurrency: body.currency || body.baseCurrency || 'BRL',
          type: body.type || 'PERSONAL',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        portfolios.push(newPort);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newPort }),
        });
      }
    });

    await page.route('**/api/v1/portfolios/*/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
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
            realizedSummaries: [
              {
                currency: 'BRL',
                status: 'KNOWN',
                grossProceeds: { amount: '1500.00', currency: 'BRL' },
                sellingCosts: { amount: '5.00', currency: 'BRL' },
                netProceeds: { amount: '1495.00', currency: 'BRL' },
                costBasisRemoved: { amount: '1200.00', currency: 'BRL' },
                realizedGainLoss: { amount: '295.00', currency: 'BRL' },
                realizedReturnPercentage: '24.58',
                disposalCount: 1,
              },
            ],
            incomeSummaries: [
              {
                currency: 'BRL',
                totalDividends: { amount: '80.00', currency: 'BRL' },
                totalJcp: { amount: '20.00', currency: 'BRL' },
                totalFiiIncome: { amount: '0.00', currency: 'BRL' },
                totalIncome: { amount: '100.00', currency: 'BRL' },
              },
            ],
            cashFlowSummaries: [],
            replayMetadata: {
              engineVersion: '1.0.0-rc.1',
              asOfDate: null,
              processedTransactionCount: 3,
              appliedTransactionCount: 3,
              deferredTransactionCount: 0,
              hasIncompleteCostBasis: false,
            },
          },
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
  });

  test('Complete Flow: Register -> Onboarding -> Today -> Tabs -> Logout', async ({ page }) => {
    // 1. Visit Register Page
    await page.goto('/register');
    await expect(page.locator('h2')).toContainText('Crie sua conta');

    // Fill registration form
    await page.fill('input[type="text"]', 'Investidor E2E');
    await page.fill('input[type="email"]', 'e2e@atlas.dev');
    await page.fill('input[autoComplete="new-password"]', 'Password123!');
    await page.fill('input[placeholder="Repita sua senha"]', 'Password123!');
    await page.click('button[type="submit"]');

    // 2. Onboarding Flow
    await expect(page).toHaveURL(/.*onboarding/);
    await expect(page.locator('h1')).toContainText('Bem-vindo ao Atlas');

    // Step 1: Click "Configurar primeira carteira"
    await page.click('button:has-text("Configurar primeira carteira")');

    // Step 2: Create First Portfolio
    await expect(page.locator('h2')).toContainText('Criar primeira carteira');
    await page.fill('input[placeholder*="Ex: Carteira"]', 'Minha Carteira Principal');
    await page.click('button:has-text("Criar e continuar")');

    // Step 3: Choose method and finish onboarding
    await expect(page.locator('h2')).toContainText('Como deseja começar?');
    await page.click('button:has-text("Ir para o Início")');

    // 3. Authenticated Landing: Today (Hoje)
    await expect(page).toHaveURL(/.*today/);
    await expect(page.locator('h1')).toContainText('Hoje');
    await expect(page.locator('text=Resumo Patrimonial')).toBeVisible();

    // Verify honest placeholders in StatCards (no fake data)
    await expect(page.locator('text=Patrimônio Total')).toBeVisible();
    await expect(page.locator('text=Disponível com Portfolio Engine')).toBeVisible();

    // 4. Navigate through all canonical tabs (using nav :visible selector for multi-viewport compatibility)
    // Carteira
    await page.locator('nav a[href="/portfolio"]:visible').click();
    await expect(page).toHaveURL(/.*portfolio/);
    await expect(page.locator('h1')).toContainText('Carteira');
    await expect(page.locator('button[role="tab"]:has-text("Visão Geral")')).toBeVisible();
    await expect(page.getByText('Posições abertas', { exact: true })).toBeVisible();
    await expect(page.locator('text=PETR4')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Ativos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Rentabilidade")')).toBeVisible();

    // Mercado
    await page.locator('nav a[href="/market"]:visible').click();
    await expect(page).toHaveURL(/.*market/);
    await expect(page.locator('h1')).toContainText('Mercado');

    // Fiscal
    await page.locator('nav a[href="/tax"]:visible').click();
    await expect(page).toHaveURL(/.*tax/);
    await expect(page.locator('h1')).toContainText('Fiscal');

    // IA
    await page.locator('nav a[href="/ai"]:visible').click();
    await expect(page).toHaveURL(/.*ai/);
    await expect(page.locator('h1')).toContainText('IA Contextual');

    // Perfil
    await page.locator('header a[href="/profile"]').click();
    await expect(page).toHaveURL(/.*profile/);
    await expect(page.locator('h1')).toContainText('Perfil');
    await expect(page.locator('h2:has-text("Investidor E2E")')).toBeVisible();

    // 5. Logout
    await page.click('button:has-text("Sair da Conta (Logout)")');
    await expect(page).toHaveURL(/.*login/);

    // Verify Private Route Protection after Logout
    await page.goto('/today');
    await expect(page).toHaveURL(/.*login/);
  });

  test('Session Hint Tamper Resistance: setting atlas_logged_in=true without session leaves private routes inaccessible', async ({
    context,
    page,
  }) => {
    // Manually tamper cookie to spoof being logged in
    await context.addCookies([
      {
        name: 'atlas_logged_in',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // Navigate to protected page
    await page.goto('/today');

    // Because there is no actual valid refresh cookie or active session,
    // the application must refuse access and redirect to login
    await expect(page).toHaveURL(/.*login/);
  });

  test('Origin Validation: mutating BFF request with cross-site origin is rejected with 403 Forbidden', async ({
    request: apiRequest,
  }) => {
    const res = await apiRequest.post('/api/auth/login', {
      headers: {
        origin: 'https://evil-attacker.example.com',
      },
      data: {
        email: 'user@atlas.dev',
        password: 'Password123!',
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('AUTH.INVALID_ORIGIN');
  });
});
