import { test, expect } from '@playwright/test';

/**
 * Focused E2E: manual operation entry (H5 Hotfix 02).
 *
 * Covers with a REAL browser (no jsdom):
 * 1. continuous typing keeps focus and full values (focus-loss regression);
 * 2. modal fits a constrained 1366x768 viewport with Save reachable;
 * 3. submit posts the canonical payload, refreshes the ledger, keeps session.
 *
 * Auth + backend are route-mocked deterministically (repo convention).
 * No real user data is touched.
 */

interface MockLedgerTx {
  id: string;
  type: string;
  tradeDate: string;
  currency: string;
  accountId: string;
  assetId: string;
  quantity: string;
  unitPrice: { amount: string; currency: string };
  source: string;
}

test.describe('Operation entry modal: focus, viewport and submission', () => {
  const user = {
    id: 'usr-e2e-op',
    name: 'Investidor E2E',
    email: 'e2e-ops@atlas.dev',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    baseCurrency: 'BRL',
  };
  const portfolio = {
    id: 'port-e2e-op',
    name: 'Carteira Principal',
    baseCurrency: 'BRL',
    type: 'PERSONAL',
    status: 'ACTIVE',
  };
  const account = {
    id: 'acc-e2e-xp',
    portfolioId: portfolio.id,
    institutionId: 'inst-e2e-xp',
    name: 'Conta XP Principal',
    currency: 'BRL',
    status: 'ACTIVE',
  };
  const assets = [
    { id: 'asset-e2e-petr4', ticker: 'PETR4', name: 'Petrobras PN' },
    { id: 'asset-e2e-vale3', ticker: 'VALE3', name: 'Vale ON' },
  ];

  let ledger: MockLedgerTx[];
  let refreshCalls: number;
  let postedBodies: unknown[];

  test.beforeEach(async ({ context, page }) => {
    ledger = [];
    refreshCalls = 0;
    postedBodies = [];

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

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: user }),
      });
    });

    await page.route('**/api/auth/refresh', async (route) => {
      refreshCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { accessToken: 'mock-refreshed-token', expiresIn: 900 },
        }),
      });
    });

    await page.route('**/api/v1/portfolios', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [portfolio] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/v1/portfolios/*/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            portfolioId: portfolio.id,
            asOfDate: null,
            completeness: { costBasis: 'COMPLETE' },
            positions: [],
            accounts: [],
            realizedSummaries: [],
            incomeSummaries: [],
            cashFlowSummaries: [],
            replayMetadata: {
              engineVersion: '1.0.0-rc.1',
              asOfDate: null,
              processedTransactionCount: 0,
              appliedTransactionCount: 0,
              deferredTransactionCount: 0,
              hasIncompleteCostBasis: false,
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/portfolios/*/valuation', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { positions: [], totalsByCurrency: {} } }),
      });
    });

    await page.route('**/api/v1/portfolios/*/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [account] }),
      });
    });

    await page.route('**/api/v1/assets*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: assets }),
      });
    });

    // Trailing wildcard: the app requests GET with ?limit=50 and Playwright
    // matches route patterns against the full URL including the query string.
    await page.route('**/api/v1/portfolios/*/transactions*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        postedBodies.push(body);
        const created: MockLedgerTx = {
          id: `tx-e2e-${ledger.length + 1}`,
          type: body.type,
          tradeDate: body.tradeDate,
          currency: body.currency,
          accountId: body.accountId,
          assetId: body.assetId,
          quantity: body.quantity,
          unitPrice: { amount: body.unitPrice, currency: body.currency },
          source: body.source,
        };
        ledger.push(created);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: created }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: ledger }),
        });
      }
    });

    await page.goto('/portfolio');
    await page.getByRole('tab', { name: 'Operações' }).click();
    await page.getByRole('button', { name: '+ Nova operação' }).click();
    await expect(page.getByRole('heading', { name: 'Adicionar Operação' })).toBeVisible();
  });

  test('continuous typing keeps focus and full values (no focus loss)', async ({ page }) => {
    const quantity = page.getByLabel('Quantidade');
    await quantity.click();
    await quantity.pressSequentially('200');
    await expect(quantity).toBeFocused();
    await expect(quantity).toHaveValue('200');

    const price = page.getByLabel('Preço Unitário');
    await price.click();
    await price.pressSequentially('22,00');
    await expect(price).toBeFocused();
    await expect(price).toHaveValue('22,00');

    const fees = page.getByLabel('Taxas (opcional)');
    await fees.click();
    await fees.pressSequentially('4,90');
    await expect(fees).toBeFocused();
    await expect(fees).toHaveValue('4,90');
  });

  test('submits canonical BUY payload, refreshes ledger and keeps session', async ({ page }) => {
    await page.getByLabel('Tipo de Operação').selectOption('BUY');
    await page.getByLabel('Ativo').selectOption('asset-e2e-petr4');
    await page.getByLabel('Conta', { exact: true }).selectOption('acc-e2e-xp');

    const quantity = page.getByLabel('Quantidade');
    await quantity.click();
    await quantity.pressSequentially('10');

    const price = page.getByLabel('Preço Unitário');
    await price.click();
    await price.pressSequentially('30,00');

    await page.getByLabel('Data da Operação').fill('2026-01-05');

    await page.getByRole('button', { name: 'Salvar Operação' }).click();

    await expect(page.getByText('Operação registrada com sucesso!')).toBeVisible();
    await expect(page.getByText('Compra', { exact: false }).first()).toBeVisible();

    expect(postedBodies).toHaveLength(1);
    expect(postedBodies[0]).toEqual({
      accountId: 'acc-e2e-xp',
      type: 'BUY',
      currency: 'BRL',
      tradeDate: '2026-01-05',
      assetId: 'asset-e2e-petr4',
      quantity: '10',
      unitPrice: '30.00',
      source: 'MANUAL',
    });

    // Session survives: still on portfolio, no login redirect, single refresh.
    await expect(page).toHaveURL(/\/portfolio/);
    expect(refreshCalls).toBeLessThanOrEqual(1);
  });

  test.describe('constrained viewport 1366x768', () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('Save stays reachable with internal scroll', async ({ page }) => {
      const save = page.getByRole('button', { name: 'Salvar Operação' });
      await expect(save).toBeVisible();

      const dialog = page.getByRole('dialog');
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(768);
    });
  });
});
