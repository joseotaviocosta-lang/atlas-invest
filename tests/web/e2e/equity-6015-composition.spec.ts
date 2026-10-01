import { test, expect, type Page } from '@playwright/test';

const MONTHLY_STATE = {
  competence: '2026-09',
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
};

const INPUT_READINESS = {
  competence: '2026-09',
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
};

function equityZero() {
  return {
    status: 'COMPLETE',
    reasonCode: null,
    normal: {
      status: 'COMPLETE',
      reasonCode: null,
      grossSales: '0',
      threshold: '20000',
      exemptionStatus: 'EXEMPT',
      matchedQuantity: null,
      currentResult: '0',
      openingLoss: '0',
      lossAdded: '0',
      lossConsumed: '0',
      closingLoss: '0',
      taxableBaseBeforeRate: '0',
      electionStatus: 'NOT_REQUIRED',
      taxRate: '15',
      grossTax: '0',
      irrfOpening: '0',
      irrfCurrent: '0',
      irrfUsed: '0',
      irrfClosing: '0',
      netTaxBefore6015Aggregation: '0',
      ruleId: 'BR-EQUITY-NORMAL',
      ruleVersion: '1.0.0',
    },
    dayTrade: {
      status: 'COMPLETE',
      reasonCode: null,
      grossSales: '0',
      threshold: null,
      exemptionStatus: 'NOT_APPLICABLE',
      matchedQuantity: '0',
      currentResult: '0',
      openingLoss: '0',
      lossAdded: '0',
      lossConsumed: '0',
      closingLoss: '0',
      taxableBaseBeforeRate: '0',
      electionStatus: 'NOT_REQUIRED',
      taxRate: '20',
      grossTax: '0',
      irrfOpening: '0',
      irrfCurrent: '0',
      irrfUsed: '0',
      irrfClosing: '0',
      netTaxBefore6015Aggregation: '0',
      ruleId: 'BR-EQUITY-DAY-TRADE',
      ruleVersion: '1.0.0',
    },
    compensationElection: {
      required: false,
      status: 'NOT_REQUIRED',
      currentValue: null,
      version: null,
      fingerprint: null,
    },
    ruleVersions: [],
  };
}

function component(category: string, amount: string) {
  return {
    category,
    label:
      category === 'FII' ? 'FII' : category === 'EQUITY_NORMAL' ? 'Operações comuns' : 'Day trade',
    status: 'COMPLETE',
    netCategoryTax: amount === '0' ? { amount: '0', currency: 'BRL' } : { amount, currency: 'BRL' },
    sourceRuleId: null,
    sourceRuleVersion: '1.0.0',
  };
}

function composition(overrides: Record<string, unknown> = {}) {
  return {
    revenueCode: '6015',
    status: 'COMPLETE',
    reasonCode: null,
    currency: 'BRL',
    total: { amount: '361.9', currency: 'BRL' },
    components: [
      component('FII', '199.9'),
      component('EQUITY_NORMAL', '150'),
      component('EQUITY_DAY_TRADE', '200'),
    ],
    fingerprint: 'composed-fp',
    ...overrides,
  };
}

function eligibility(overrides: Record<string, unknown> = {}) {
  return {
    status: 'PAYABLE',
    reasonCode: null,
    revenueCode: '6015',
    targetCompetence: '2026-09',
    currency: 'BRL',
    currentAmount: { amount: '361.9', currency: 'BRL' },
    carryForwardAmount: null,
    totalPayable: { amount: '361.9', currency: 'BRL' },
    minimumThreshold: { amount: '10', currency: 'BRL' },
    dueDate: '2026-10-30',
    sources: [
      {
        kind: 'CURRENT',
        sourceObligationId: 'ob-1',
        sourceCompetence: '2026-09',
        amount: { amount: '361.9', currency: 'BRL' },
        entryId: null,
      },
    ],
    rule: {
      ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
      ruleVersion: '1.0.0',
      minimumAmount: { amount: '10', currency: 'BRL' },
      sourceDocument: 'Lei nº 9.430/1996, art. 68',
      verifiedAt: '2026-09-29',
    },
    darfPreparationV2: {
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currentPrincipal: { amount: '361.9', currency: 'BRL' },
      carryForwardAmount: null,
      totalPayable: { amount: '361.9', currency: 'BRL' },
      minimumThreshold: { amount: '10', currency: 'BRL' },
      dueDate: '2026-10-30',
      eligibilityStatus: 'PAYABLE',
      lateFee: null,
      interest: null,
      officialUpdatedAmount: null,
    },
    dataQuality: 'COMPLETE',
    disclaimer: 'x',
    ...overrides,
  };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ob-1',
    competence: '2026-09',
    taxBucket: 'FII_SALE',
    revenueCode: '6015',
    status: 'OPEN',
    baseStatus: 'OPEN',
    reasonCode: null,
    principalAmount: { amount: '361.9', currency: 'BRL' },
    currency: 'BRL',
    dueDate: '2026-10-30',
    darfReadiness: 'READY',
    darfReadinessReason: null,
    dataQuality: 'COMPLETE',
    liabilityFingerprint: 'x'.repeat(64),
    revision: 1,
    deadline: {
      entryId: 'd-1',
      dueDate: '2026-10-30',
      version: 1,
      sourceAuthority: 'RFB',
      sourceDocument: 'ADE CORAT 78/2026',
      sourceReference: '',
      sourcePublishedAt: '2026-09-28',
      verifiedAt: '2026-09-28',
    },
    darfPreparation: null,
    composition: null,
    payments: [],
    supersededById: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

async function install(page: Page, summary: Record<string, unknown>): Promise<void> {
  await page.context().addCookies([
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
    const url = route.request().url();
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (/darf-readiness/.test(url))
      return json({
        obligationId: 'ob-1',
        competence: '2026-09',
        status: 'USER_ACTION_REQUIRED',
        reasonCode: null,
        generationMode: 'OFFICIAL_INTERACTIVE_HANDOFF',
        eligible: true,
        overdue: false,
        revenueCode: '6015',
        dueDate: '2026-10-30',
        preparedValues: {
          revenueCode: '6015',
          competence: '2026-09',
          dueDate: '2026-10-30',
          principalAmount: { amount: '361.9', currency: 'BRL' },
          carryForwardAmount: null,
          lateFeeAmount: null,
          interestAmount: null,
          totalAmount: { amount: '361.9', currency: 'BRL' },
        },
        destination: {
          sourceSystem: 'RFB_SICALC',
          url: 'https://sicalc.receita.fazenda.gov.br/sicalc/principal.do',
          prefillSupported: false,
        },
        requiresTaxpayerIdentity: true,
        requiresUserAction: true,
        instructions: [],
        identity: { identityAvailable: false, identityType: null, maskedIdentifier: null },
        adjustment: null,
        sourceSystem: 'RFB_SICALC',
        officialGenerationSupported: false,
        disclaimer: 'O DARF oficial é emitido no serviço oficial.',
      });
    if (/\/monthly\/[^/]+\/payment-summary/.test(url)) return json(summary);
    if (/\/monthly\/[^/]+\/liability/.test(url))
      return json({
        competence: '2026-09',
        status: 'COMPLETE',
        ruleVersions: [],
        categories: [],
        totalTaxBeforeCredits: null,
        creditsApplied: null,
        taxDue: null,
        openingLossBalances: [],
        closingLossBalances: [],
        dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
        capabilities: {
          foundationOnly: true,
          productionRuleVerified: false,
          withholdingSupported: false,
          taxLiabilitySupported: false,
        },
        calculationVersion: 'tax-calculation-v1',
        engineVersion: '0.1.0',
        limitations: [],
        traceSummary: [],
        equity: equityZero(),
      });
    if (/\/monthly\/[^/]+\/obligation/.test(url))
      return json(
        obligation({
          composition: summary.composition,
          status: (summary.obligation as { status?: string })?.status ?? 'OPEN',
        }),
      );
    if (/\/inputs\/(trade-classifications|withholdings|fii-metadata)/.test(url)) return json([]);
    if (/\/inputs\//.test(url)) return json(INPUT_READINESS);
    if (/\/obligations/.test(url)) return json([]);
    if (/\/darfs/.test(url)) return json([]);
    if (/\/monthly\//.test(url)) return json(MONTHLY_STATE);
    return json([]);
  });
}

async function gotoComposed(page: Page): Promise<void> {
  await page.goto('/tax');
  await expect(page.getByTestId('composed-6015-revenue-code')).toBeVisible();
}

function summary(overrides: {
  composition?: Record<string, unknown> | null;
  eligibility?: Record<string, unknown>;
  obligation?: Record<string, unknown>;
}) {
  return {
    competence: '2026-09',
    composition: overrides.composition === undefined ? composition() : overrides.composition,
    eligibility: overrides.eligibility ?? eligibility(),
    obligation: overrides.obligation ?? {
      id: 'ob-1',
      status: 'OPEN',
      baseStatus: 'OPEN',
      darfReadiness: 'READY',
      dueDate: '2026-10-30',
    },
    aggregation: null,
    openCarryForwardEntries: [],
  };
}

test.describe('Phase 4G.2C — composed 6015 section (real browser)', () => {
  test('A. normal-only composition renders the single 6015 amount', async ({ page }) => {
    await install(
      page,
      summary({
        composition: composition({
          total: { amount: '150', currency: 'BRL' },
          components: [
            component('FII', '0'),
            component('EQUITY_NORMAL', '150'),
            component('EQUITY_DAY_TRADE', '0'),
          ],
        }),
        eligibility: eligibility({
          currentAmount: { amount: '150', currency: 'BRL' },
          totalPayable: { amount: '150', currency: 'BRL' },
        }),
      }),
    );
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-revenue-code')).toContainText('6015');
    await expect(page.getByTestId('composed-6015-component-EQUITY_NORMAL')).toContainText(
      'Operações comuns',
    );
    await expect(page.getByTestId('composed-6015-total')).toContainText('150');
  });

  test('D. all-three composition lists every component and the total', async ({ page }) => {
    await install(page, summary({}));
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-component-FII')).toContainText('FII');
    await expect(page.getByTestId('composed-6015-component-EQUITY_NORMAL')).toContainText('150');
    await expect(page.getByTestId('composed-6015-component-EQUITY_DAY_TRADE')).toContainText('200');
    await expect(page.getByTestId('composed-6015-total')).toContainText('361');
  });

  test('G. payable composition shows the amount to pay and the deadline', async ({ page }) => {
    await install(page, summary({}));
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-payable')).toContainText('361');
    await expect(page.getByTestId('composed-6015-eligibility')).toContainText('Valor a pagar');
    await expect(page.getByTestId('composed-6015-darf-ready')).toBeVisible();
  });

  test('E. below-minimum composition defers and never shows a payable DARF', async ({ page }) => {
    await install(
      page,
      summary({
        composition: composition({
          total: { amount: '9.9', currency: 'BRL' },
          components: [
            component('FII', '9.9'),
            component('EQUITY_NORMAL', '0'),
            component('EQUITY_DAY_TRADE', '0'),
          ],
        }),
        eligibility: eligibility({
          status: 'CARRIED_FORWARD',
          currentAmount: { amount: '9.9', currency: 'BRL' },
          totalPayable: { amount: '9.9', currency: 'BRL' },
        }),
      }),
    );
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-deferred')).toBeVisible();
    await expect(page.getByTestId('composed-6015-payable')).toContainText('—');
  });

  test('J. a blocked composition shows no authoritative amount', async ({ page }) => {
    await install(
      page,
      summary({
        composition: composition({
          status: 'BLOCKED',
          reasonCode: 'COMPONENT_BLOCKED',
          total: null,
          components: [
            { ...component('FII', '199.9'), status: 'COMPLETE' },
            { ...component('EQUITY_NORMAL', '0'), status: 'BLOCKED', netCategoryTax: null },
            { ...component('EQUITY_DAY_TRADE', '0'), status: 'BLOCKED', netCategoryTax: null },
          ],
        }),
        eligibility: eligibility({ status: 'BLOCKED', totalPayable: null, currentAmount: null }),
        obligation: {
          id: 'ob-1',
          status: 'BLOCKED',
          baseStatus: 'BLOCKED',
          darfReadiness: 'BLOCKED',
          dueDate: null,
        },
      }),
    );
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-blocked')).toBeVisible();
    await expect(page.getByTestId('composed-6015-total')).toHaveCount(0);
  });

  test('N. an overdue obligation surfaces the overdue notice', async ({ page }) => {
    await install(
      page,
      summary({
        obligation: {
          id: 'ob-1',
          status: 'OVERDUE',
          baseStatus: 'OPEN',
          darfReadiness: 'READY',
          dueDate: '2026-09-30',
        },
      }),
    );
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-overdue')).toBeVisible();
  });

  test('Q. an empty composition shows the empty state', async ({ page }) => {
    await install(page, summary({ composition: null }));
    await page.goto('/tax');
    await expect(page.getByText('Sem composição 6015')).toBeVisible();
  });

  test('L. narrow viewport keeps the composed section usable without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, summary({}));
    await gotoComposed(page);
    await expect(page.getByTestId('composed-6015-total')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
  });
});
