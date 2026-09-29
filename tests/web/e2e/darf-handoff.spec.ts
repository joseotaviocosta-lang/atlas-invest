import { test, expect } from '@playwright/test';

const OFFICIAL_URL = 'https://sicalc.receita.fazenda.gov.br/sicalc/principal';

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

const OBLIGATION = {
  id: 'ob-1',
  competence: '2026-09',
  taxBucket: 'FII_SALE',
  revenueCode: '6015',
  status: 'OPEN',
  baseStatus: 'OPEN',
  reasonCode: null,
  principalAmount: { amount: '199.9', currency: 'BRL' },
  currency: 'BRL',
  dueDate: '2026-10-30',
  darfReadiness: 'READY',
  darfReadinessReason: null,
  dataQuality: 'COMPLETE',
  liabilityFingerprint: 'x'.repeat(64),
  revision: 1,
  deadline: {
    entryId: 'e1',
    dueDate: '2026-10-30',
    version: 1,
    sourceAuthority: 'RFB',
    sourceDocument: 'ADE CORAT nº 78/2026',
    sourceReference: 'https://www.gov.br/receitafederal',
    sourcePublishedAt: '2026-09-28',
    verifiedAt: '2026-09-28',
  },
  darfPreparation: null,
  payments: [],
  supersededById: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const READINESS = {
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
    principalAmount: { amount: '199.9', currency: 'BRL' },
    carryForwardAmount: null,
    lateFeeAmount: null,
    interestAmount: null,
    totalAmount: { amount: '199.9', currency: 'BRL' },
  },
  destination: {
    sourceSystem: 'RFB_SICALC',
    url: OFFICIAL_URL,
    prefillSupported: false,
  },
  requiresTaxpayerIdentity: false,
  requiresUserAction: true,
  instructions: ['Acesse o Sicalc oficial da Receita Federal'],
  identity: { identityAvailable: false, identityType: null, maskedIdentifier: null },
  adjustment: null,
  sourceSystem: 'RFB_SICALC',
  officialGenerationSupported: false,
  disclaimer: 'O Atlas não emite nem armazena o DARF oficial.',
};

const LIABILITY = {
  competence: '2026-09',
  status: 'NO_ACTIVITY',
  ruleVersions: [],
  categories: [],
  totalTaxBeforeCredits: null,
  creditsApplied: null,
  taxDue: null,
  openingLossBalances: [],
  closingLossBalances: [],
  dataQuality: { status: 'EMPTY', issues: [], issueCount: 0 },
  calculationTrace: [],
  capabilities: {
    foundationOnly: true,
    productionRuleVerified: false,
    withholdingSupported: false,
    taxLiabilitySupported: false,
  },
  calculationVersion: 'tax-calculation-v1',
  engineVersion: '0.1.0',
  limitations: [],
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

test.describe('Phase 4F — official Sicalc DARF handoff (real UI)', () => {
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

    // Dispatch all fiscal reads used by the tax page.
    await page.route('**/api/v1/fiscal/**', (route) => {
      const url = route.request().url();
      const json = (data: unknown) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data }),
        });
      if (/\/obligations\/[^/]+\/darf-readiness/.test(url)) return json(READINESS);
      if (/\/obligations\/[^/]+\/adjustment/.test(url)) {
        return json({
          status: 'NOT_LATE',
          reasonCode: null,
          principalAmount: { amount: '199.9', currency: 'BRL' },
          lateFeeAmount: null,
          interestAmount: null,
          updatedAmount: null,
          dueDate: '2026-10-30',
          paymentDate: '2026-10-01',
          authority: { source: 'UNAVAILABLE' },
        });
      }
      if (/\/monthly\/[^/]+\/obligation/.test(url)) return json(OBLIGATION);
      if (/\/monthly\/[^/]+\/liability/.test(url)) return json(LIABILITY);
      if (/\/inputs\/(trade-classifications|withholdings|fii-metadata)/.test(url)) return json([]);
      if (/\/inputs\//.test(url)) return json(INPUT_READINESS);
      if (/\/obligations/.test(url)) return json([]);
      if (/\/monthly\//.test(url)) return json(MONTHLY_STATE);
      return json([]);
    });

    // Intercept the official destination so the popup does not hit the network.
    await context.route('**sicalc.receita.fazenda.gov.br/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>sicalc</html>' }),
    );
  });

  test('exposes "Abrir Sicalc" pointing only to the official origin, without prefill', async ({
    page,
  }) => {
    await page.goto('/tax');

    const link = page.getByTestId('darf-open-sicalc');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Abrir Sicalc');
    await expect(page.getByTestId('darf-status')).toContainText('Dados preparados');

    const href = await link.getAttribute('href');
    expect(href).toBe(OFFICIAL_URL);
    // No fabricated prefill parameters.
    expect(href).not.toContain('?');
    // Never claims local generation.
    await expect(page.getByText('Gerar DARF oficial')).toHaveCount(0);
    // Generated != paid copy is present.
    await expect(
      page.getByText('O documento oficial não marca a obrigação como paga', { exact: false }),
    ).toBeVisible();
  });

  test('clicking "Abrir Sicalc" opens the official destination (no fake generation)', async ({
    page,
    context,
  }) => {
    await page.goto('/tax');
    const link = page.getByTestId('darf-open-sicalc');
    await expect(link).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    expect(popup.url()).toBe(OFFICIAL_URL);
    // The obligation remains unpaid (no payment evidence was created by the click).
    await expect(page.getByTestId('darf-status')).toContainText('Dados preparados');
    void context;
  });
});
