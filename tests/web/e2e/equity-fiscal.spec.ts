import { test, expect, type Page, type BrowserContext } from '@playwright/test';

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

const OBLIGATION = {
  id: 'ob-1',
  competence: '2026-09',
  taxBucket: 'FII_SALE',
  revenueCode: '6015',
  status: 'BLOCKED',
  baseStatus: 'BLOCKED',
  reasonCode: null,
  principalAmount: { amount: '0', currency: 'BRL' },
  currency: 'BRL',
  dueDate: null,
  darfReadiness: 'BLOCKED',
  darfReadinessReason: null,
  dataQuality: 'COMPLETE',
  liabilityFingerprint: 'x'.repeat(64),
  revision: 1,
  deadline: null,
  darfPreparation: null,
  payments: [],
  supersededById: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const FII_CATEGORY = {
  category: 'FII',
  currency: 'BRL',
  status: 'COMPLETE',
  ruleVersion: 'BR-FII-SALE-20-2015',
  ruleSetStatus: 'VERIFIED',
  grossSales: { amount: '30000.00', currency: 'BRL' },
  realizedResult: { amount: '5000.00', currency: 'BRL' },
  taxableBaseBeforeLosses: { amount: '5000.00', currency: 'BRL' },
  openingLossBalance: { amount: '0', currency: 'BRL' },
  lossApplied: { amount: '0', currency: 'BRL' },
  lossGenerated: { amount: '0', currency: 'BRL' },
  closingLossBalance: { amount: '0', currency: 'BRL' },
  taxableBaseAfterLosses: { amount: '5000.00', currency: 'BRL' },
  ratePercentage: '20',
  taxBeforeWithholding: { amount: '1000.00', currency: 'BRL' },
  withholdingApplied: { amount: '0', currency: 'BRL' },
  taxDue: { amount: '1000.00', currency: 'BRL' },
  qualityIssues: [],
  trace: [],
};

interface EquityCategory {
  status: string;
  reasonCode: string | null;
  grossSales: string;
  threshold: string | null;
  exemptionStatus: string;
  matchedQuantity: string | null;
  currentResult: string;
  openingLoss: string;
  lossAdded: string;
  lossConsumed: string;
  closingLoss: string;
  taxableBaseBeforeRate: string;
  electionStatus: string;
}

interface EquityFixture {
  competence: string;
  status: string;
  reasonCode: string | null;
  normal: EquityCategory;
  dayTrade: EquityCategory;
  compensationElection: {
    required: boolean;
    status: string;
    currentValue: string | null;
    version: number | null;
    fingerprint: string | null;
  };
  ruleVersions: string[];
}

function category(overrides: Partial<EquityCategory> = {}): EquityCategory {
  return {
    status: 'COMPLETE',
    reasonCode: null,
    grossSales: '18000',
    threshold: '20000',
    exemptionStatus: 'EXEMPT',
    matchedQuantity: null,
    currentResult: '2000',
    openingLoss: '5000',
    lossAdded: '0',
    lossConsumed: '0',
    closingLoss: '5000',
    taxableBaseBeforeRate: '0',
    electionStatus: 'NOT_REQUIRED',
    ...overrides,
  };
}

function equity(overrides: Partial<EquityFixture> = {}): EquityFixture {
  return {
    competence: '2026-09',
    status: 'COMPLETE',
    reasonCode: null,
    normal: category(),
    dayTrade: category({
      grossSales: '0',
      matchedQuantity: '0',
      exemptionStatus: 'NOT_APPLICABLE',
      currentResult: '0',
      openingLoss: '0',
      closingLoss: '0',
    }),
    compensationElection: {
      required: false,
      status: 'NOT_REQUIRED',
      currentValue: null,
      version: null,
      fingerprint: null,
    },
    ruleVersions: ['equity-monthly-core-v1'],
    ...overrides,
  };
}

interface Harness {
  putBodies: Record<string, unknown>[];
  liabilityGets: number;
  liabilityStatus: number;
}

async function setupHarness(
  page: Page,
  context: BrowserContext,
  initial: EquityFixture,
): Promise<Harness> {
  const state: Harness & { equity: EquityFixture } = {
    equity: initial,
    putBodies: [],
    liabilityGets: 0,
    liabilityStatus: 200,
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

    if (/elections\/equity-exempt-loss/.test(url)) {
      if (request.method() === 'PUT') {
        const body = JSON.parse(request.postData() || '{}');
        state.putBodies.push(body);
        const value = String(body.value);
        const previous = state.equity.compensationElection;
        state.equity = {
          ...state.equity,
          compensationElection: {
            required: false,
            status: value === 'DECLARE_FOR_CARRYFORWARD' ? 'DECLARED' : 'NOT_DECLARED',
            currentValue: value,
            version: (previous.version ?? 0) + 1,
            fingerprint: 'fp',
          },
        };
        return json({ ...state.equity, created: true });
      }
      return json(state.equity);
    }
    if (/\/monthly\/[^/]+\/liability/.test(url)) {
      state.liabilityGets += 1;
      if (state.liabilityStatus !== 200) {
        return route.fulfill({
          status: state.liabilityStatus,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'boom', code: 'INTERNAL' }),
        });
      }
      return json({
        competence: '2026-09',
        status: 'COMPLETE',
        ruleVersions: [],
        categories: [FII_CATEGORY],
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
        equity: state.equity,
      });
    }
    if (/\/monthly\/[^/]+\/obligation/.test(url)) return json(OBLIGATION);
    if (/\/inputs\/(trade-classifications|withholdings|fii-metadata)/.test(url)) return json([]);
    if (/\/inputs\//.test(url)) return json(INPUT_READINESS);
    if (/\/obligations/.test(url)) return json([]);
    if (/\/darfs/.test(url)) return json([]);
    if (/\/monthly\//.test(url)) return json(MONTHLY_STATE);
    return json([]);
  });

  return state;
}

async function gotoFiscal(page: Page): Promise<void> {
  await page.goto('/tax');
  await expect(page.getByTestId('equity-fiscal-section')).toBeVisible();
}

test.describe('Phase 4G.2A.1c — equity fiscal election UX (real browser)', () => {
  test('A. exempt profit renders server values and no election surface', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, equity());
    await gotoFiscal(page);
    const normal = page.getByTestId('equity-normal-card');
    await expect(normal).toContainText('Isento pelo limite mensal');
    await expect(normal).toContainText('5.000,00');
    await expect(page.getByTestId('equity-election')).toHaveCount(0);
  });

  test('B. taxable month renders the taxable exemption status', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      equity({ normal: category({ grossSales: '25000', exemptionStatus: 'TAXABLE' }) }),
    );
    await gotoFiscal(page);
    await expect(page.getByTestId('equity-normal-card')).toContainText(
      'Acima do limite mensal de isenção',
    );
  });

  test('C. exempt loss without election requires a decision with no preselection', async ({
    page,
    context,
  }) => {
    await setupHarness(
      page,
      context,
      equity({
        normal: category({ currentResult: '-2000', electionStatus: 'ELECTION_REQUIRED' }),
        compensationElection: {
          required: true,
          status: 'ELECTION_REQUIRED',
          currentValue: null,
          version: null,
          fingerprint: null,
        },
      }),
    );
    await gotoFiscal(page);
    await expect(page.getByTestId('equity-election')).toBeVisible();
    await expect(page.getByTestId('equity-election-declare')).toBeVisible();
    await expect(page.getByTestId('equity-election-decline')).toBeVisible();
    await expect(page.getByTestId('equity-election-declare')).not.toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('equity-election-decline')).not.toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('D. declare sends value only and refetches server state', async ({ page, context }) => {
    const state = await setupHarness(
      page,
      context,
      equity({
        normal: category({ currentResult: '-2000', electionStatus: 'ELECTION_REQUIRED' }),
        compensationElection: {
          required: true,
          status: 'ELECTION_REQUIRED',
          currentValue: null,
          version: null,
          fingerprint: null,
        },
      }),
    );
    await gotoFiscal(page);
    const getsBefore = state.liabilityGets;

    await page.getByTestId('equity-election-declare').click();
    await expect(page.getByText('Confirmar opção fiscal')).toBeVisible();
    await page.getByTestId('equity-election-confirm').click();

    await expect(page.getByTestId('equity-election-status')).toContainText('Prejuízo reconhecido');
    expect(state.liabilityGets).toBeGreaterThan(getsBefore);
    expect(state.putBodies).toHaveLength(1);
    expect(state.putBodies[0]).toEqual({ value: 'DECLARE_FOR_CARRYFORWARD' });
    expect(state.putBodies[0].taxSubjectId).toBeUndefined();
  });

  test('E. decline updates server state to not recognized', async ({ page, context }) => {
    const state = await setupHarness(
      page,
      context,
      equity({
        normal: category({ currentResult: '-2000', electionStatus: 'ELECTION_REQUIRED' }),
        compensationElection: {
          required: true,
          status: 'ELECTION_REQUIRED',
          currentValue: null,
          version: null,
          fingerprint: null,
        },
      }),
    );
    await gotoFiscal(page);
    await page.getByTestId('equity-election-decline').click();
    await page.getByTestId('equity-election-confirm').click();
    await expect(page.getByTestId('equity-election-status')).toContainText(
      'Prejuízo não reconhecido',
    );
    expect(state.putBodies[0]).toEqual({ value: 'DO_NOT_DECLARE' });
  });

  test('F. revision changes an existing decision', async ({ page, context }) => {
    const state = await setupHarness(
      page,
      context,
      equity({
        compensationElection: {
          required: false,
          status: 'DECLARED',
          currentValue: 'DECLARE_FOR_CARRYFORWARD',
          version: 1,
          fingerprint: 'fp',
        },
      }),
    );
    await gotoFiscal(page);
    await expect(page.getByTestId('equity-election-status')).toContainText('Prejuízo reconhecido');
    await page.getByTestId('equity-election-decline').click();
    await page.getByTestId('equity-election-confirm').click();
    await expect(page.getByTestId('equity-election-status')).toContainText(
      'Prejuízo não reconhecido',
    );
    expect(state.putBodies[0]).toEqual({ value: 'DO_NOT_DECLARE' });
  });

  test('G. unknown asset classification shows a blocked message', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      equity({ status: 'BLOCKED', reasonCode: 'UNKNOWN_ASSET_TAX_CLASSIFICATION' }),
    );
    await gotoFiscal(page);
    const blocked = page.getByTestId('equity-blocked');
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText('classificação fiscal');
    await expect(page.getByTestId('equity-election')).toHaveCount(0);
  });

  test('H. missing canonical cost basis shows a blocked message', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      equity({ status: 'BLOCKED', reasonCode: 'MISSING_CANONICAL_COST_BASIS' }),
    );
    await gotoFiscal(page);
    await expect(page.getByTestId('equity-blocked')).toContainText('custo');
  });

  test('I. server error shows an error state with retry', async ({ page, context }) => {
    const state = await setupHarness(page, context, equity());
    state.liabilityStatus = 500;
    await page.goto('/tax');
    await expect(page.getByText('Falha ao carregar a apuração de ações')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });

  test('J. empty month shows the empty state without election UI', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      equity({
        normal: category({ grossSales: '0', currentResult: '0' }),
        dayTrade: category({
          grossSales: '0',
          matchedQuantity: '0',
          currentResult: '0',
          exemptionStatus: 'NOT_APPLICABLE',
        }),
      }),
    );
    await gotoFiscal(page);
    await expect(page.getByTestId('equity-empty')).toBeVisible();
    await expect(page.getByTestId('equity-election')).toHaveCount(0);
  });

  test('K. equity section coexists with the existing FII section', async ({ page, context }) => {
    await setupHarness(page, context, equity());
    await gotoFiscal(page);
    await expect(page.getByTestId('equity-normal-card')).toBeVisible();
    await expect(page.getByText('Fundos imobiliários (FII) · BRL')).toBeVisible();
  });

  test('L. narrow viewport has no overflow and keeps the modal usable', async ({
    page,
    context,
  }) => {
    await setupHarness(
      page,
      context,
      equity({
        normal: category({ currentResult: '-2000', electionStatus: 'ELECTION_REQUIRED' }),
        compensationElection: {
          required: true,
          status: 'ELECTION_REQUIRED',
          currentValue: null,
          version: null,
          fingerprint: null,
        },
      }),
    );
    await gotoFiscal(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByTestId('equity-election-declare').click();
    const confirm = page.getByTestId('equity-election-confirm');
    await expect(confirm).toBeVisible();
    const box = await confirm.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  });
});
