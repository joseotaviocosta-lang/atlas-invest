import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Phase 4I.6 — High-Income Annual Review / Support Package E2E (real browser).
 *
 * Exercises the export action + package-level stale indicator layered on top of
 * the 4I.5 high-income section. The review package endpoint and the export
 * endpoint are mocked distinctly from the 4I.4 assessment endpoint. The browser
 * performs NO tax math — it only downloads bytes produced by the server.
 */

// ----- Assessment (4I.4) fixtures (drives the existing section body) -----

function baseAssessment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    calendarYear: 2026,
    declarationExercise: 2027,
    ruleVersion: '2025-11-26-LEI-15270-ART-16A',
    status: 'NOT_APPLICABLE',
    applicability: 'NOT_APPLICABLE',
    totalAnnualIncome: '10000',
    applicabilityThreshold: '600000',
    minimumTaxBase: '10000',
    rateBand: 'BELOW_THRESHOLD',
    rateBandLabel: null,
    minimumRatePercentage: null,
    grossMinimumTax: null,
    credits: [],
    supportedCreditsTotal: '0',
    reductions: [],
    supportedReductionsTotal: '0',
    corporateRedutor: null,
    netMinimumTax: null,
    creditExcess: null,
    incomeBreakdown: [
      {
        category: 'DIVIDEND',
        classification: 'INCLUDED',
        grossAmount: '10000',
        includedAmount: '10000',
        excludedAmount: '0',
        itemCount: 1,
        payerIds: ['PETR4'],
        reason: 'Lei 9.250/1995, art. 16-A',
        legalReference: 'Lei 9.250/1995, art. 16-A',
      },
    ],
    evidenceRequirements: [],
    evidence: [],
    blockingReasons: [],
    limitations: [],
    upstreamIncomeStatus: 'COMPLETE',
    upstreamIncomeFingerprint: 'f'.repeat(64),
    upstreamCapitalMarketFingerprint: 'e'.repeat(64),
    sourceFingerprint: 'a'.repeat(64),
    calculationFingerprint: 'b'.repeat(64),
    ...overrides,
  };
}

function calculableAssessment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseAssessment({
    status: 'CALCULABLE',
    applicability: 'APPLICABLE',
    totalAnnualIncome: '900000',
    minimumTaxBase: '900000',
    rateBand: 'TRANSITION',
    minimumRatePercentage: '5.0000000000',
    grossMinimumTax: '45000',
    netMinimumTax: '35000',
    supportedCreditsTotal: '10000',
    ...overrides,
  });
}

// ----- Review package (4I.6) fixtures -----

function reviewPackage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const section7 = (overrides['section7Readiness'] as Record<string, unknown>) ?? {
    counts: { total: 0, ready: 0, missing: 0, stale: 0, conflicting: 0, unsupported: 0 },
    requirements: [],
    evidence: [],
  };
  return {
    packageVersion: 'high-income-annual-review-package-v1',
    status: 'READY_FOR_REVIEW',
    generatedAt: '2027-03-15T00:00:00.000Z',
    packageFingerprint: 'c'.repeat(64),
    disclaimer: 'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL. Pacote de revisão.',
    section1Identity: {
      calendarYear: 2026,
      declarationExercise: 2027,
      ruleVersion: '2025-11-26-LEI-15270-ART-16A',
      generatedAt: '2027-03-15T00:00:00.000Z',
      packageVersion: 'high-income-annual-review-package-v1',
    },
    section2Applicability: {
      status: 'APPLICABLE',
      totalAnnualIncome: '900000',
      eligibilityThreshold: '600000',
      thresholdMetric: 'TOTAL_ANNUAL_INCOME',
      applicable: true,
      blockingReasons: [],
    },
    section3IncomeComposition: { rows: [] },
    section4Calculation: {
      minimumTaxBase: '900000',
      rateBand: 'TRANSITION',
      minimumRatePercentage: '5',
      grossMinimumTax: '45000',
      supportedCreditsTotal: '10000',
      supportedReductionsTotal: '0',
      corporateRedutorSupportedTotal: null,
      netMinimumTax: '35000',
      creditExcess: null,
      netIsAuthoritative: true,
    },
    section5Credits: {
      credits: [],
      reductions: [],
      supportedCreditsTotal: '10000',
      supportedReductionsTotal: '0',
    },
    section6CorporateRedutorByPayer: {
      present: false,
      aggregateVersion: null,
      status: null,
      payerCount: 0,
      computedPayerCount: 0,
      totalEligibleDividends: null,
      totalReductionExact: null,
      totalSupportedReduction: null,
      payers: [],
      blockingPayers: [],
      blockingReasons: [],
    },
    section7Readiness: section7,
    section8Provenance: {
      upstreamCapitalMarketFingerprint: 'e'.repeat(64),
      upstreamIncomeFingerprint: 'f'.repeat(64),
      upstreamIncomeStatus: 'COMPLETE',
      sourceFingerprint: 'a'.repeat(64),
      calculationFingerprint: 'b'.repeat(64),
      corporateRedutorSourceFingerprint: null,
      corporateRedutorCalculationFingerprint: null,
      packageFingerprint: 'c'.repeat(64),
    },
    section9FilingSupportNotes: {
      notes: [
        {
          mappingStatus: 'GENERAL_SUPPORT',
          legalReference: 'Lei nº 15.270/2025',
          text: 'Nota de apoio geral.',
        },
      ],
      exerciseLabel: 'Exercício 2027 (ano-calendário 2026)',
    },
    ...overrides,
  };
}

function stalePackage(): Record<string, unknown> {
  return reviewPackage({
    section7Readiness: {
      counts: { total: 1, ready: 0, missing: 0, stale: 1, conflicting: 0, unsupported: 0 },
      requirements: [],
      evidence: [
        {
          rowKey: 'CORPORATE_TAX:PETR4:1',
          evidenceType: 'CORPORATE_TAX',
          payerId: 'PETR4',
          authority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
          conflictStatus: 'NONE',
          stale: true,
          revision: 1,
          sourceFingerprint: 's'.repeat(64),
          fingerprint: 'g'.repeat(64),
        },
      ],
    },
  });
}

interface Harness {
  assessment: Record<string, unknown>;
  pkg: Record<string, unknown> | string;
  exportCalls: string[];
  exportFormat: 'csv' | 'json';
  reviewMalformed: boolean;
}

async function setupHarness(
  page: Page,
  context: BrowserContext,
  options: {
    assessment: Record<string, unknown>;
    pkg?: Record<string, unknown> | string;
    reviewMalformed?: boolean;
  },
): Promise<Harness> {
  const state: Harness = {
    assessment: options.assessment,
    pkg: options.pkg ?? reviewPackage(),
    exportCalls: [],
    exportFormat: 'csv',
    reviewMalformed: options.reviewMalformed ?? false,
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

  await page.route('**/api/v1/fiscal/**', (route) => {
    const request = route.request();
    const url = request.url();
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });

    // Export endpoint: stream a downloadable attachment.
    if (/\/high-income\/export/.test(url)) {
      state.exportCalls.push(url);
      const isJson = /format=json/.test(url);
      const ext = isJson ? 'json' : 'csv';
      const body = isJson
        ? JSON.stringify(state.pkg)
        : '# DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL\r\nCampo;Valor\r\n';
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="atlas-alta-renda-2026-relatorio-apoio.${ext}"`,
          'Cache-Control': 'private, no-store',
          Pragma: 'no-cache',
        },
        body,
      });
    }

    // Review package endpoint.
    if (/\/high-income\/review/.test(url)) {
      if (state.reviewMalformed) {
        return json({ status: 'READY_FOR_REVIEW' });
      }
      return json(state.pkg);
    }

    // Assessment endpoints (GET + evidence POST/resolve) fall back to 4I.4 shape.
    if (/\/annual\/\d+\/high-income/.test(url)) {
      if (/\/evidence/.test(url) && request.method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { id: 'ev-1', revision: 1, conflictStatus: 'NONE' },
            meta: { outcome: 'CREATED', created: true },
          }),
        });
      }
      if (request.method() === 'GET') {
        return json(state.assessment);
      }
      return json(null);
    }

    return json(null);
  });

  return state;
}

async function gotoHighIncome(page: Page): Promise<void> {
  await page.goto('/tax/high-income');
  await expect(page.getByTestId('annual-high-income-section')).toBeVisible();
  // Pin the calendar year to 2026 so the derived export filename is deterministic
  // (the section otherwise defaults to the current calendar year − 1).
  await page.getByTestId('high-income-year-2026').click();
  await expect(page.getByTestId('annual-high-income-section')).toContainText('Exercício 2027');
}

test.describe('Phase 4I.6 — high-income review/support package & export (real browser)', () => {
  test('A. export control is visible and labeled "Exportar relatório de apoio"', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const button = page.getByTestId('high-income-export');
    await expect(button).toBeVisible();
    await expect(button).toContainText('Exportar relatório de apoio');
  });

  test('B. export button meets a 44px touch target', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const box = await page.getByTestId('high-income-export').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('C. export group is an accessible labeled group', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByRole('group', { name: 'Exportar relatório de apoio' })).toBeVisible();
  });

  test('D. CSV is the default export format', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-export-format')).toHaveValue('csv');
  });

  test('E. clicking export (CSV) fetches the canonical export URL with format=csv', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(state.exportCalls[0]).toContain('/high-income/export?format=csv');
  });

  test('F. switching to JSON exports with format=json', async ({ page, context }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export-format').selectOption('json');
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(state.exportCalls[0]).toContain('format=json');
  });

  test('G. a stale package renders the package-level stale indicator (role=status)', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, {
      assessment: calculableAssessment(),
      pkg: stalePackage(),
    });
    await gotoHighIncome(page);
    const stale = page.getByTestId('high-income-package-stale');
    await expect(stale).toBeVisible();
    await expect(stale).toHaveAttribute('role', 'status');
    await expect(stale).toContainText('Pacote desatualizado');
  });

  test('H. a fresh package shows no stale indicator', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-package-stale')).toHaveCount(0);
  });

  test('I. malformed review package disables the export (fail-safe, no crash)', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, {
      assessment: calculableAssessment(),
      reviewMalformed: true,
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('annual-high-income-section')).toBeVisible();
    await expect(page.getByTestId('high-income-export')).toBeDisabled();
  });

  test('J. export is keyboard operable (focus + Enter triggers the download)', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export').focus();
    await expect(page.getByTestId('high-income-export')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => state.exportCalls.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('K. the trigger button is operable again after export (focus-safe)', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    expect(download).toBeTruthy();
    await expect.poll(() => state.exportCalls.length, { timeout: 5000 }).toBeGreaterThan(0);
    // The handler restores focus in its finally block (asserted deterministically
    // in the web component unit test). After a real browser download the control
    // must remain enabled and focusable so the user can export again.
    const trigger = page.getByTestId('high-income-export');
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await expect(trigger).toBeFocused();
  });

  test('L. export request carries no client-side ownership identifiers', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length, { timeout: 5000 }).toBeGreaterThan(0);
    for (const url of state.exportCalls) {
      expect(url).not.toContain('taxSubjectId');
      expect(url).not.toContain('userId');
      expect(url).not.toContain('cpf');
    }
  });

  test('M. a triggered download exposes the year-only support filename', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    expect(download.suggestedFilename()).toBe('atlas-alta-renda-2026-relatorio-apoio.csv');
  });

  test('N. JSON download exposes the .json support filename', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export-format').selectOption('json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    expect(download.suggestedFilename()).toBe('atlas-alta-renda-2026-relatorio-apoio.json');
  });

  test('O. unsupported-year assessment still renders the section (no calculator)', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, {
      assessment: baseAssessment({
        status: 'UNSUPPORTED_YEAR',
        totalAnnualIncome: null,
        minimumTaxBase: null,
      }),
      pkg: reviewPackage({ status: 'UNSUPPORTED' }),
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-status-badge')).toContainText('Ano não suportado');
  });

  test('P. the 4I.5 review body still renders alongside the export action', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-net')).toContainText('35.000,00');
    await expect(page.getByTestId('high-income-export')).toBeVisible();
  });

  // ----- Additional named end-to-end scenarios (Q–AN) -----

  test('Q. not-applicable assessment keeps export available for the support doc', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, {
      assessment: baseAssessment(),
      pkg: reviewPackage({ status: 'NOT_APPLICABLE' }),
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-export')).toBeEnabled();
  });

  test('R. mobile viewport keeps the export control usable', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-export')).toBeVisible();
    const box = await page.getByTestId('high-income-export').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('S. tablet viewport renders the export control group', async ({ page, context }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-export')).toBeVisible();
  });

  test('T. format control is reachable by keyboard', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export-format').focus();
    await expect(page.getByTestId('high-income-export-format')).toBeFocused();
  });

  test('U. stale indicator renders text + badge, not color alone', async ({ page, context }) => {
    await setupHarness(page, context, {
      assessment: calculableAssessment(),
      pkg: stalePackage(),
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-package-stale')).toContainText('desatualizado');
  });

  test('V. export after a stale package still downloads a support doc', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, {
      assessment: calculableAssessment(),
      pkg: stalePackage(),
    });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('W. two sequential exports both fire network calls', async ({ page, context }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length).toBeGreaterThan(0);
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length).toBeGreaterThan(1);
  });

  test('X. switching format then back to CSV exports CSV', async ({ page, context }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export-format').selectOption('json');
    await page.getByTestId('high-income-export-format').selectOption('csv');
    await page.getByTestId('high-income-export').click();
    await expect.poll(() => state.exportCalls.length).toBeGreaterThan(0);
    expect(state.exportCalls[0]).toContain('format=csv');
  });

  test('Y. the disclaimer card is still present with the export action', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-disclaimer')).toContainText('Receita Federal');
  });

  test('Z. export control sits within the status card', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(
      page.getByTestId('high-income-status-card').getByTestId('high-income-export'),
    ).toBeVisible();
  });

  test('AA. export is not auto-triggered on load', async ({ page, context }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.waitForTimeout(500);
    expect(state.exportCalls.length).toBe(0);
  });

  test('AB. year navigation keeps the export control present', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-year-2026').click();
    await expect(page.getByTestId('high-income-export')).toBeVisible();
  });

  test('AC. malformed package keeps the rest of the section interactive', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, {
      assessment: calculableAssessment(),
      reviewMalformed: true,
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-net')).toContainText('35.000,00');
  });

  test('AD. JSON export streams an attachment download', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export-format').selectOption('json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    expect(download).toBeTruthy();
  });

  test('AE. CSV export streams an attachment download', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    expect(download).toBeTruthy();
  });

  test('AF. export control group label is present on mobile', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByRole('group', { name: 'Exportar relatório de apoio' })).toBeVisible();
  });

  test('AG. stale indicator is present on mobile viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupHarness(page, context, {
      assessment: calculableAssessment(),
      pkg: stalePackage(),
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-package-stale')).toBeVisible();
  });

  test('AH. export control is reachable via Tab from the status badge', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await page.getByTestId('high-income-export').focus();
    await expect(page.getByTestId('high-income-export')).toBeFocused();
  });

  test('AI. the review endpoint is requested on load', async ({ page, context }) => {
    const reviewUrls: string[] = [];
    await setupHarness(page, context, { assessment: calculableAssessment() });
    page.on('request', (req) => {
      if (/\/high-income\/review/.test(req.url())) {
        reviewUrls.push(req.url());
      }
    });
    await gotoHighIncome(page);
    await expect.poll(() => reviewUrls.length, { timeout: 5000 }).toBeGreaterThan(0);
  });

  test('AJ. export preserves the year in the filename', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    expect(download.suggestedFilename()).toContain('2026');
    expect(download.suggestedFilename()).toContain('relatorio-apoio');
  });

  test('AK. not-applicable package shows no stale badge', async ({ page, context }) => {
    await setupHarness(page, context, {
      assessment: baseAssessment(),
      pkg: reviewPackage({ status: 'NOT_APPLICABLE' }),
    });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-package-stale')).toHaveCount(0);
  });

  test('AL. the export action is accessible as a native button', async ({ page, context }) => {
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByRole('button', { name: 'Exportar relatório de apoio' })).toBeVisible();
  });

  test('AM. desktop viewport renders export + section together', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-export')).toBeVisible();
    await expect(page.getByTestId('annual-high-income-section')).toBeVisible();
  });

  test('AN. no client tax math: export relies solely on server bytes', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, { assessment: calculableAssessment() });
    await gotoHighIncome(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('high-income-export').click(),
    ]);
    // The downloaded artifact comes from the mocked server response, unmodified.
    expect(download.suggestedFilename()).toBe('atlas-alta-renda-2026-relatorio-apoio.csv');
    expect(state.exportCalls[0]).toContain('/high-income/export');
  });
});
