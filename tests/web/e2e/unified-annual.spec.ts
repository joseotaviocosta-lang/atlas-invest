import { test, expect, type Page, type BrowserContext } from '@playwright/test';

function moduleEntry(
  module: string,
  source: string,
  status: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    module,
    source,
    status,
    authoritative: status === 'READY',
    blockingReasons: [],
    requirements: [],
    sourceFingerprint: 'a'.repeat(64),
    calculationFingerprint: null,
    ...overrides,
  };
}

function baseState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    calendarYear: 2026,
    declarationExercise: 2027,
    status: 'REQUIRES_ACTION',
    summary: {
      moduleCount: 5,
      readyCount: 3,
      actionRequiredCount: 1,
      blockedCount: 0,
      noActivityCount: 0,
      notApplicableCount: 1,
      unsupportedCount: 0,
      consistencyIssueCount: 0,
      blockingIssueCount: 0,
    },
    modules: [
      moduleEntry('ANNUAL_POSITIONS', '4H.2', 'READY'),
      moduleEntry('CAPITAL_MARKETS', '4H.3', 'READY'),
      moduleEntry('INVESTMENT_INCOME', '4H.4', 'READY'),
      moduleEntry('READINESS_EVIDENCE', '4H.5', 'REQUIRES_CONFIRMATION', {
        requirements: [
          {
            key: 'READINESS_EVIDENCE::TAXPAYER_CONFIRMATIONS::_annual_::TAXPAYER_CONFIRMATIONS',
            module: 'READINESS_EVIDENCE',
            category: 'TAXPAYER_CONFIRMATIONS',
            nativeType: 'TAXPAYER_CONFIRMATIONS',
            subjectReference: '_annual_',
            status: 'PENDING',
            blockingReason: null,
          },
        ],
      }),
      moduleEntry('HIGH_INCOME_MINIMUM_TAX', '4I', 'NOT_APPLICABLE'),
    ],
    requirements: [
      {
        key: 'READINESS_EVIDENCE::TAXPAYER_CONFIRMATIONS::_annual_::TAXPAYER_CONFIRMATIONS',
        module: 'READINESS_EVIDENCE',
        category: 'TAXPAYER_CONFIRMATIONS',
        nativeType: 'TAXPAYER_CONFIRMATIONS',
        subjectReference: '_annual_',
        status: 'PENDING',
        blockingReason: null,
      },
    ],
    consistencyIssues: [],
    sourceFingerprint: 'b'.repeat(64),
    annualFingerprint: 'c'.repeat(64),
    ...overrides,
  };
}

async function setupHarness(
  page: Page,
  context: BrowserContext,
  state: Record<string, unknown>,
): Promise<void> {
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

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'usr-e2e-1',
          name: 'Investidor E2E',
          email: 'e2e@atlas.dev',
          locale: 'pt-BR',
          timezone: 'America/Sao_Paulo',
          baseCurrency: 'BRL',
        },
      }),
    }),
  );
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { accessToken: 'mock-token', expiresIn: 900 } }),
    }),
  );
  await page.route('**/api/v1/portfolios', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );

  await page.route('**/api/v1/fiscal/annual/**', (route) => {
    const url = route.request().url();
    if (/\/annual\/\d+(\?|$)/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: state }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });
}

async function gotoUnified(page: Page): Promise<void> {
  await page.goto('/tax/annual/2026');
  await expect(page.getByTestId('unified-annual-section')).toBeVisible();
}

test.describe('Phase 4J.1 — unified annual IRPF orchestration (real browser)', () => {
  test('renders overall status, module cards and the action-required list', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, baseState());
    await gotoUnified(page);
    await expect(page.getByTestId('unified-annual-status-badge')).toContainText('Ação necessária');
    await expect(page.getByTestId('unified-annual-module-ANNUAL_POSITIONS')).toBeVisible();
    await expect(page.getByTestId('unified-annual-module-HIGH_INCOME_MINIMUM_TAX')).toContainText(
      'Não aplicável',
    );
    await expect(page.getByTestId('unified-annual-actions')).toContainText('Pendências (1)');
  });

  test('BLOCKING consistency issues are highly visible (role=alert)', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      baseState({
        status: 'BLOCKED',
        consistencyIssues: [
          {
            code: 'SOURCE_FINGERPRINT_MISMATCH',
            severity: 'BLOCKING',
            modules: ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'],
            detail: 'Revisões divergentes entre os módulos.',
          },
        ],
      }),
    );
    await gotoUnified(page);
    const blockingBanner = page.getByTestId('unified-annual-blocking-issues');
    await expect(blockingBanner).toBeVisible();
    // Scope the role=alert assertion to the blocking-issues banner: an unscoped
    // page-level getByRole('alert') also matches Next.js's always-present
    // `__next-route-announcer__` live region, violating Playwright strict mode.
    await expect(blockingBanner.getByRole('alert')).toContainText('impedem a revisão');
  });

  test('deep links into existing 4H/4I detail pages', async ({ page, context }) => {
    await setupHarness(page, context, baseState());
    await gotoUnified(page);
    const link = page.getByTestId('unified-annual-deeplink-HIGH_INCOME_MINIMUM_TAX');
    await expect(link).toHaveAttribute('href', '/tax/high-income');
  });

  test('malformed response fails safely without crash', async ({ page, context }) => {
    await setupHarness(page, context, { status: 'READY_FOR_REVIEW' } as unknown as Record<
      string,
      unknown
    >);
    await gotoUnified(page);
    await expect(page.getByTestId('unified-annual-section')).toContainText(
      'Resposta inválida do servidor',
    );
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`core view usable at ${viewport.name} viewport`, async ({ page, context }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupHarness(page, context, baseState());
      await gotoUnified(page);
      await expect(page.getByTestId('unified-annual-status-badge')).toBeVisible();
      await expect(page.getByTestId('unified-annual-modules')).toBeVisible();
    });
  }
});

test.describe('Phase 4J.2 — unified annual review package (real browser)', () => {
  const PACKAGE = {
    packageVersion: 'unified-annual-review-package-v1',
    status: 'REQUIRES_ACTION',
    packageFingerprint: 'f'.repeat(64),
    sectionGProvenance: { annualFingerprint: 'a'.repeat(64) },
  };

  async function setupPackageHarness(
    page: Page,
    context: BrowserContext,
    pkg: unknown,
  ): Promise<{ csvSeen: { current: number } }> {
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
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'usr-e2e-1',
            name: 'Investidor E2E',
            email: 'e2e@atlas.dev',
            locale: 'pt-BR',
            timezone: 'America/Sao_Paulo',
            baseCurrency: 'BRL',
          },
        }),
      }),
    );
    await page.route('**/api/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: 'mock-token', expiresIn: 900 } }),
      }),
    );
    await page.route('**/api/v1/portfolios', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );
    const csvSeen = { current: 0 };
    await page.route('**/api/v1/fiscal/annual/**', (route) => {
      const url = route.request().url();
      if (url.includes('/review-package/export')) {
        if (url.includes('format=json')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
              'Content-Disposition': 'attachment; filename="atlas-irpf-2026-relatorio-apoio.json"',
            },
            body: JSON.stringify({ packageFingerprint: 'f'.repeat(64), status: 'OK' }),
          });
        }
        csvSeen.current += 1;
        return route.fulfill({
          status: 200,
          contentType: 'text/csv',
          headers: {
            'Content-Disposition': 'attachment; filename="atlas-irpf-2026-relatorio-apoio.csv"',
          },
          body: '# DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL\r\nSECAO A;X\r\n',
        });
      }
      if (/\/review-package(\?|$)/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: pkg }),
        });
      }
      if (/\/annual\/\d+(\?|$)/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: baseState() }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    });
    return { csvSeen };
  }

  test('export action renders with support-only labeling', async ({ page, context }) => {
    await setupPackageHarness(page, context, PACKAGE);
    await gotoUnified(page);
    const exportCard = page.getByTestId('unified-annual-export');
    await expect(exportCard).toBeVisible();
    await expect(exportCard).toContainText('Relatório anual de apoio');
    await expect(exportCard).toContainText('não é arquivo oficial da Receita Federal');
    await expect(page.getByTestId('unified-annual-export-format')).toHaveValue('csv');
    await expect(page.getByTestId('unified-annual-export-button')).toContainText(
      'Exportar relatório anual de apoio',
    );
  });

  test('CSV export downloads with the year-only filename', async ({ page, context }) => {
    await setupPackageHarness(page, context, PACKAGE);
    await gotoUnified(page);
    const button = page.getByTestId('unified-annual-export-button');
    await expect(button).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(download.suggestedFilename()).toBe('atlas-irpf-2026-relatorio-apoio.csv');
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
  });

  test('JSON export downloads JSON bytes', async ({ page, context }) => {
    await setupPackageHarness(page, context, PACKAGE);
    await gotoUnified(page);
    await page.getByTestId('unified-annual-export-format').selectOption('json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('unified-annual-export-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('atlas-irpf-2026-relatorio-apoio.json');
  });

  test('malformed package disables export with a fail-safe note', async ({ page, context }) => {
    await setupPackageHarness(page, context, { status: 'READY_FOR_REVIEW' });
    await gotoUnified(page);
    await expect(page.getByTestId('unified-annual-export-unavailable')).toBeVisible();
    await expect(page.getByTestId('unified-annual-export-button')).toHaveCount(0);
  });

  test('no false stale warning after a fresh export', async ({ page, context }) => {
    await setupPackageHarness(page, context, PACKAGE);
    await gotoUnified(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('unified-annual-export-button').click(),
    ]);
    expect(download.suggestedFilename()).toContain('atlas-irpf-2026');
    await expect(page.getByTestId('unified-annual-package-stale')).toHaveCount(0);
  });

  test('export flow is keyboard operable', async ({ page, context }) => {
    await setupPackageHarness(page, context, PACKAGE);
    await gotoUnified(page);
    const formatSelect = page.getByTestId('unified-annual-export-format');
    await formatSelect.focus();
    await expect(formatSelect).toBeFocused();
    await page.keyboard.press('Tab');
    const button = page.getByTestId('unified-annual-export-button');
    await expect(button).toBeFocused();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Enter'),
    ]);
    expect(download.suggestedFilename()).toBe('atlas-irpf-2026-relatorio-apoio.csv');
  });

  test('export card usable at mobile viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupPackageHarness(page, context, PACKAGE);
    await gotoUnified(page);
    await expect(page.getByTestId('unified-annual-export')).toBeVisible();
    await expect(page.getByTestId('unified-annual-export-button')).toBeVisible();
  });
});
