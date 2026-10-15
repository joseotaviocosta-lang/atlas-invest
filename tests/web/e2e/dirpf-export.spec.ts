import { test, expect, type Page, type BrowserContext } from '@playwright/test';

async function setupAuthAndRoutes(page: Page, context: BrowserContext): Promise<void> {
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
      body: JSON.stringify({ data: [{ id: 'p-1', name: 'Carteira Principal' }] }),
    }),
  );

  await page.route('**/api/v1/fiscal/obligations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );

  await page.route('**/api/v1/fiscal/inputs/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          competence: '2026-10',
          tradeClassificationStatus: 'NOT_REQUIRED',
          withholdingStatus: 'NOT_REQUIRED',
          fiiMetadataStatus: 'NOT_REQUIRED',
          issues: [],
          capabilities: {
            tradeClassificationComplete: true,
            withholdingComplete: true,
            fiiMetadataComplete: true,
          },
          classificationCoverage: { required: 0, classified: 0, unknown: 0 },
          provenanceReferences: [],
          rows: [],
          productionTaxLiabilityEnabled: false,
          ruleCoverage: 'UNAVAILABLE',
          liabilityStatus: 'AVAILABLE',
          productionVerifiedRuleCount: 0,
        },
      }),
    }),
  );

  await page.route('**/api/v1/fiscal/monthly/**', (route) => {
    const url = route.request().url();
    if (url.includes('/obligation') || url.includes('/liability')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          competence: '2026-10',
          status: 'COMPLETE',
          eventCount: 0,
          currencies: [],
          categories: [],
          events: [],
          dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
          ruleSetVersion: 'BR_TEST',
          ruleSetStatus: 'TEST_ONLY',
          capabilities: {
            foundationOnly: true,
            productionRuleVerified: false,
            withholdingSupported: false,
            taxLiabilitySupported: false,
          },
          projectionVersion: 'fiscal-projection-v1',
          engineVersion: '0.1.0',
        },
      }),
    });
  });

  await page.route('**/api/v1/fiscal/annual/**', (route) => {
    const url = route.request().url();
    if (url.includes('/reporting/export')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'content-disposition': 'attachment; filename="atlas-suporte-irpf-2026.csv"',
        },
        body: 'Ano-Calendário;Seção;Código;Discriminação;Situação em 31/12/2025;Situação em 31/12/2026\n2026;Bens e Direitos;31;PETR4;0,00;4404,90',
      });
    }
    if (url.includes('/reporting')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            calendarYear: 2026,
            declarationExercise: 2027,
            taxSubjectId: 'usr-e2e-1',
            generatedAt: '2026-10-15T12:00:00Z',
            disclaimer: 'Documento de apoio informativo.',
            overallStatus: 'READY',
            isReadyForReporting: true,
            reportingRuleVersion: '1.0.0',
            packageFingerprint: 'pkg-e2e-mock',
            totalItems: 1,
            blockedItems: [],
            pendingConfirmations: [],
            sections: [
              {
                section: 'BENS_E_DIREITOS',
                title: 'Bens e Direitos',
                status: 'READY',
                itemCount: 1,
                isComplete: true,
                blockingReasons: [],
                items: [
                  {
                    reportingItemId: 'item-1',
                    section: 'BENS_E_DIREITOS',
                    category: 'ACOES',
                    officialMappingCode: '31',
                    officialMappingLabel: 'Ações (inclusive as provenientes de linha telefônica)',
                    mappingStatus: 'OFFICIAL',
                    description: 'Ações PETR4 - Petróleo Brasileiro S.A. - 200 ações',
                    ticker: 'PETR4',
                    economicPeriod: '2026',
                    costBasis: '4404.90',
                    closingCostBasis: '4404.90',
                    openingCostBasis: '0.00',
                    closingQuantity: '200',
                    openingQuantity: '0',
                    currency: 'BRL',
                    reportingStatus: 'READY',
                    isBlocked: false,
                    blockingReasons: [],
                    sourceReferences: ['tx-1'],
                    sourceFingerprint: 'fp-1',
                    ruleVersion: '1.0.0',
                  },
                ],
              },
            ],
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });
}

test.describe('DIRPF Support CSV Export (B4 browser download verification)', () => {
  test('clicks "Exportar Guia (.CSV)" and triggers real browser file download', async ({
    page,
    context,
  }) => {
    page.on('pageerror', (err) => console.warn('PAGE ERROR:', err.message, err.stack));
    await setupAuthAndRoutes(page, context);

    await page.goto('/tax');

    // Select 2026 to verify target year export
    await page.selectOption('#reporting-year-select', '2026');

    // Ensure the export button is visible
    const exportBtn = page.getByTestId('export-reporting-csv-btn');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await expect(exportBtn).toContainText('Exportar Guia (.CSV)');

    // Trigger download and wait for event
    const [download] = await Promise.all([page.waitForEvent('download'), exportBtn.click()]);

    expect(download.suggestedFilename()).toBe('atlas-suporte-irpf-2026.csv');
    const path = await download.path();
    expect(path).toBeTruthy();
  });
});
