import { test, expect, type Page, type BrowserContext } from '@playwright/test';

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
    credits: [
      {
        kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE',
        role: 'CREDIT',
        supported: true,
        provided: true,
        amount: '10000',
        applied: true,
        requiredForNet: true,
        legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, I',
        reason: 'APPLIED',
      },
    ],
    supportedCreditsTotal: '10000',
    ...overrides,
  });
}

function payer(payerId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payerId,
    payerType: 'STANDARD_CORPORATE',
    status: 'APPLICABLE',
    referenceRatePercentage: '34',
    corporateEffectiveRatePercentage: '33.5',
    pfEffectiveRatePercentage: '1.6666666667',
    eligibleDividends: '700000',
    reductionExact: '8166.67',
    evidenceStatus: 'AUTHORITATIVE',
    blockingReasons: [],
    sourceFingerprint: 's'.repeat(64),
    ...overrides,
  };
}

interface Harness {
  postedBodies: Record<string, unknown>[];
  highIncomeGets: number;
  assessment: Record<string, unknown>;
  postStatus: number;
  fiscalUrls: string[];
}

async function setupHarness(
  page: Page,
  context: BrowserContext,
  assessment: Record<string, unknown>,
): Promise<Harness> {
  const state: Harness = {
    postedBodies: [],
    highIncomeGets: 0,
    assessment,
    postStatus: 201,
    fiscalUrls: [],
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

    if (/\/annual\/\d+\/high-income/.test(url)) {
      if (/\/evidence\/.+\/resolve/.test(url) && request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        state.postedBodies.push({ resolve: body });
        const evidence = (state.assessment['evidence'] as Array<Record<string, unknown>>).map(
          (row) => ({ ...row, conflictStatus: 'NONE', revision: (row['revision'] as number) + 1 }),
        );
        state.assessment = { ...state.assessment, evidence, status: 'CALCULABLE' };
        return json({ data: evidence[0], meta: { outcome: 'SUPERSEDED' } });
      }
      if (/\/evidence$/.test(url) && request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        state.postedBodies.push(body);
        return route.fulfill({
          status: state.postStatus,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { id: 'ev-1', revision: 1, conflictStatus: 'NONE' },
            meta: { outcome: 'CREATED', created: true },
          }),
        });
      }
      if (request.method() === 'GET') {
        state.highIncomeGets += 1;
        state.fiscalUrls.push(url);
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
}

test.describe('Phase 4I.5 — high-income annual review (real browser)', () => {
  test('A. not applicable renders year/exercise, status and threshold explanation', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, baseAssessment());
    await gotoHighIncome(page);
    await page.getByTestId('high-income-year-2026').click();
    await expect(page.getByTestId('high-income-status-badge')).toContainText('Não aplicável');
    await expect(page.getByTestId('annual-high-income-section')).toContainText(
      'Ano-calendário 2026',
    );
    await expect(page.getByTestId('annual-high-income-section')).toContainText('Exercício 2027');
    await expect(page.getByTestId('high-income-total')).toContainText('10.000,00');
    await expect(page.getByTestId('high-income-net')).toContainText('—');
    await expect(page.getByTestId('high-income-disclaimer')).toContainText('Receita Federal');
  });

  test('B. calculable renders summary values, breakdown, net and disclaimer', async ({
    page,
    context,
  }) => {
    await setupHarness(page, context, calculableAssessment());
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-status-badge')).toContainText('Apurado pelo Atlas');
    await expect(page.getByTestId('high-income-gross')).toContainText('45.000,00');
    await expect(page.getByTestId('high-income-net')).toContainText('35.000,00');
    await expect(page.getByTestId('high-income-base')).toContainText('900.000,00');
  });

  test('C. missing evidence shows gross known, net unavailable and payer action', async ({
    page,
    context,
  }) => {
    await setupHarness(
      page,
      context,
      baseAssessment({
        status: 'INCOMPLETE_REDUCTION_DATA',
        applicability: 'APPLICABLE',
        totalAnnualIncome: '700000',
        minimumTaxBase: '700000',
        grossMinimumTax: '11666.67',
        corporateRedutor: {
          aggregateVersion: 'high-income-corporate-redutor-v1',
          payerCount: 1,
          computedPayerCount: 0,
          status: 'REQUIRES_EVIDENCE',
          totalEligibleDividends: '700000',
          totalReductionExact: '0',
          totalSupportedReduction: null,
          payers: [payer('PETR4', { status: 'REQUIRES_EVIDENCE', evidenceStatus: 'MISSING' })],
          blockingPayers: ['PETR4'],
          blockingReasons: [],
        },
        evidenceRequirements: [
          {
            requirementId: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE:subj',
            requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            subjectId: 'PETR4',
            title: 'Evidência tributária da fonte pagadora',
            status: 'PENDING',
            legalReference: 'Lei 9.250/1995, art. 16-B',
            blockingReason: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING',
          },
        ],
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-gross')).toContainText('11.666,67');
    await expect(page.getByTestId('high-income-net')).toContainText('—');
    await expect(page.getByTestId('high-income-payer-PETR4')).toContainText('Evidência necessária');
    await expect(
      page.getByTestId('high-income-requirement-CORPORATE_EFFECTIVE_TAX_EVIDENCE'),
    ).toBeVisible();
  });

  test('D. conflict is visible with a resolution path and no authoritative net', async ({
    page,
    context,
  }) => {
    const conflictId = 'c37c6dd2-63b6-432b-aefd-b38e5162bb41';
    await setupHarness(
      page,
      context,
      baseAssessment({
        status: 'BLOCKED',
        applicability: 'APPLICABLE',
        totalAnnualIncome: '700000',
        minimumTaxBase: '700000',
        grossMinimumTax: '11666.67',
        blockingReasons: ['CONFLICTING_CORPORATE_EVIDENCE:PETR4'],
        evidence: [
          {
            id: conflictId,
            evidenceType: 'CORPORATE_TAX',
            payerId: 'PETR4',
            authority: 'AUTHORITATIVE',
            evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
            conflictStatus: 'CONFLICT',
            stale: false,
            revision: 2,
            supersedesId: 'prev-id',
            sourceFingerprint: 's'.repeat(64),
            fingerprint: 'f'.repeat(64),
          },
        ],
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId(`high-income-conflict-${conflictId}`)).toContainText(
      'Conflitante',
    );
    await expect(page.getByTestId('high-income-net')).toContainText('—');
    await page.getByTestId(`high-income-resolve-accept-${conflictId}`).click();
    await expect(page.getByTestId('high-income-status-badge')).toContainText('Apurado pelo Atlas');
  });

  test('E. evidence POST sends value-only payload and refetches', async ({ page, context }) => {
    const state = await setupHarness(page, context, baseAssessment());
    await gotoHighIncome(page);
    await page.getByTestId('high-income-evidence-open').click();
    await page.getByTestId('high-income-form-payer').selectOption('PETR4');
    await page.getByTestId('high-income-form-profit').fill('800000.00');
    await page.getByTestId('high-income-form-irpj').fill('200000.00');
    await page.getByTestId('high-income-form-csll').fill('68000.00');
    await page.getByTestId('high-income-evidence-submit').click();
    await expect.poll(() => state.postedBodies.length, { timeout: 5000 }).toBeGreaterThan(0);
    const body = state.postedBodies[0] as Record<string, unknown>;
    expect(body['taxSubjectId']).toBeUndefined();
    expect(body['authority']).toBeUndefined();
    expect(body['payerId']).toBe('PETR4');
    expect(body['accountingProfit']).toBe('800000.00');
  });

  test('F. double submit relies on server idempotency (button disables while pending)', async ({
    page,
    context,
  }) => {
    const state = await setupHarness(page, context, baseAssessment());
    await gotoHighIncome(page);
    await page.getByTestId('high-income-evidence-open').click();
    await page.getByTestId('high-income-form-payer').selectOption('PETR4');
    await page.getByTestId('high-income-form-profit').fill('800000.00');
    await page.getByTestId('high-income-form-irpj').fill('200000.00');
    await page.getByTestId('high-income-form-csll').fill('68000.00');
    await page.getByTestId('high-income-evidence-submit').dblclick();
    await page.waitForTimeout(500);
    expect(state.postedBodies.length).toBeLessThanOrEqual(2);
    for (const body of state.postedBodies) {
      expect((body as Record<string, unknown>)['authority']).toBeUndefined();
    }
  });

  test('G. stale evidence is visible and degrades the net', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      baseAssessment({
        status: 'INCOMPLETE_REDUCTION_DATA',
        applicability: 'APPLICABLE',
        totalAnnualIncome: '700000',
        minimumTaxBase: '700000',
        grossMinimumTax: '11666.67',
        evidence: [
          {
            id: 'stale-1',
            evidenceType: 'CORPORATE_TAX',
            payerId: 'PETR4',
            authority: 'AUTHORITATIVE',
            evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
            conflictStatus: 'NONE',
            stale: true,
            revision: 1,
            supersedesId: null,
            sourceFingerprint: 's'.repeat(64),
            fingerprint: 'f'.repeat(64),
          },
        ],
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-stale-stale-1')).toContainText('Desatualizada');
    await expect(page.getByTestId('high-income-net')).toContainText('—');
  });

  test('H. multi-payer keeps independent statuses without merge', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      baseAssessment({
        status: 'INCOMPLETE_REDUCTION_DATA',
        applicability: 'APPLICABLE',
        totalAnnualIncome: '700000',
        minimumTaxBase: '700000',
        grossMinimumTax: '11666.67',
        corporateRedutor: {
          aggregateVersion: 'high-income-corporate-redutor-v1',
          payerCount: 2,
          computedPayerCount: 1,
          status: 'REQUIRES_EVIDENCE',
          totalEligibleDividends: '700000',
          totalReductionExact: '0',
          totalSupportedReduction: null,
          payers: [
            payer('PETR4', { eligibleDividends: '400000' }),
            payer('ITUB4', {
              eligibleDividends: '300000',
              status: 'REQUIRES_EVIDENCE',
              evidenceStatus: 'MISSING',
            }),
          ],
          blockingPayers: ['ITUB4'],
          blockingReasons: [],
        },
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-payer-PETR4')).toContainText('Redutor apurado');
    await expect(page.getByTestId('high-income-payer-ITUB4')).toContainText('Evidência necessária');
    await expect(page.getByTestId('high-income-net')).toContainText('—');
  });

  test('I. no request carries client-side ownership or authority', async ({ page, context }) => {
    const state = await setupHarness(page, context, baseAssessment());
    await gotoHighIncome(page);
    await expect.poll(() => state.highIncomeGets, { timeout: 5000 }).toBeGreaterThan(0);
    for (const url of state.fiscalUrls) {
      expect(url).not.toContain('taxSubjectId');
      expect(url).not.toContain('userId');
    }
    for (const body of state.postedBodies) {
      expect(body['taxSubjectId']).toBeUndefined();
      expect(body['userId']).toBeUndefined();
      expect(body['authority']).toBeUndefined();
    }
    // Year navigation refetches server state for the new year only.
    await page.getByTestId('high-income-year-2026').click();
    await expect.poll(() => state.highIncomeGets, { timeout: 5000 }).toBeGreaterThan(1);
    expect(state.fiscalUrls.some((url) => url.includes('/2026/high-income'))).toBe(true);
  });

  test('J. unsupported year shows a safe message without calculator', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      baseAssessment({
        calendarYear: 2028,
        declarationExercise: 2029,
        status: 'UNSUPPORTED_YEAR',
        totalAnnualIncome: null,
        minimumTaxBase: null,
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-status-badge')).toContainText('Ano não suportado');
    await expect(page.getByTestId('high-income-net')).toContainText('—');
  });

  test('K. large decimals render without scientific notation', async ({ page, context }) => {
    await setupHarness(
      page,
      context,
      calculableAssessment({
        totalAnnualIncome: '999999999999.99',
        minimumTaxBase: '999999999999.99',
        grossMinimumTax: '100000000000',
        netMinimumTax: '100000000000',
      }),
    );
    await gotoHighIncome(page);
    const gross = await page.getByTestId('high-income-gross').textContent();
    expect(gross).not.toContain('e');
    expect(gross).not.toContain('E');
    expect(gross).toContain('100.000.000.000,00');
  });

  test('L. zero renders as R$ 0,00 while unknown renders as unavailable', async ({
    page,
    context,
  }) => {
    await setupHarness(
      page,
      context,
      calculableAssessment({
        grossMinimumTax: '45000',
        netMinimumTax: '0',
        corporateRedutor: {
          aggregateVersion: 'high-income-corporate-redutor-v1',
          payerCount: 1,
          computedPayerCount: 1,
          status: 'APPLICABLE',
          totalEligibleDividends: '700000',
          totalReductionExact: '0',
          totalSupportedReduction: '0',
          payers: [payer('PETR4', { reductionExact: '0', corporateEffectiveRatePercentage: '30' })],
          blockingPayers: [],
          blockingReasons: [],
        },
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-net')).toContainText('0,00');
    await expect(page.getByTestId('high-income-payer-PETR4')).toContainText('0,00');
  });

  test('M. 1k payers remain usable with filtering', async ({ page, context }) => {
    const payers = Array.from({ length: 1000 }, (_, index) =>
      payer(`P${index}`, {
        status: index % 2 === 0 ? 'APPLICABLE' : 'REQUIRES_EVIDENCE',
        evidenceStatus: index % 2 === 0 ? 'AUTHORITATIVE' : 'MISSING',
      }),
    );
    await setupHarness(
      page,
      context,
      baseAssessment({
        status: 'INCOMPLETE_REDUCTION_DATA',
        applicability: 'APPLICABLE',
        totalAnnualIncome: '900000',
        minimumTaxBase: '900000',
        grossMinimumTax: '45000',
        corporateRedutor: {
          aggregateVersion: 'high-income-corporate-redutor-v1',
          payerCount: 1000,
          computedPayerCount: 500,
          status: 'REQUIRES_EVIDENCE',
          totalEligibleDividends: '900000',
          totalReductionExact: '0',
          totalSupportedReduction: null,
          payers,
          blockingPayers: payers
            .filter((payer) => payer['status'] === 'REQUIRES_EVIDENCE')
            .map((payer) => payer['payerId']),
          blockingReasons: [],
        },
      }),
    );
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-payers')).toBeVisible();
    await page.getByTestId('high-income-payer-status-filter').selectOption('REQUIRES_EVIDENCE');
    await expect(page.getByTestId('high-income-payer-P1')).toBeVisible();
    await expect(page.getByTestId('high-income-payer-P0')).toHaveCount(0);
  });

  test('N. mobile viewport keeps the core review flow usable', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupHarness(page, context, calculableAssessment());
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-status-badge')).toBeVisible();
    await expect(page.getByTestId('high-income-net')).toContainText('35.000,00');
    await page.getByTestId('high-income-evidence-open').click();
    await expect(page.getByTestId('high-income-evidence-form')).toBeVisible();
  });

  test('O. evidence flow is usable keyboard-only', async ({ page, context }) => {
    await setupHarness(page, context, baseAssessment());
    await gotoHighIncome(page);
    await page.getByTestId('high-income-evidence-open').focus();
    await expect(page.getByTestId('high-income-evidence-open')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('high-income-evidence-form')).toBeVisible();
    await page.getByTestId('high-income-form-type').focus();
    await expect(page.getByTestId('high-income-form-type')).toBeFocused();
  });

  test('P. malformed response fails safely without crash', async ({ page, context }) => {
    await setupHarness(page, context, { status: 'CALCULABLE' } as unknown as Record<
      string,
      unknown
    >);
    await gotoHighIncome(page);
    await expect(page.getByTestId('annual-high-income-section')).toContainText('Resposta inválida');
  });

  test('Q. 10k payers render, filter and sort without pathological cost', async ({
    page,
    context,
  }) => {
    const payers = Array.from({ length: 10000 }, (_, index) =>
      payer(`Q${index}`, {
        status: index % 2 === 0 ? 'APPLICABLE' : 'REQUIRES_EVIDENCE',
        evidenceStatus: index % 2 === 0 ? 'AUTHORITATIVE' : 'MISSING',
      }),
    );
    await setupHarness(
      page,
      context,
      baseAssessment({
        status: 'INCOMPLETE_REDUCTION_DATA',
        applicability: 'APPLICABLE',
        totalAnnualIncome: '900000',
        minimumTaxBase: '900000',
        grossMinimumTax: '45000',
        corporateRedutor: {
          aggregateVersion: 'high-income-corporate-redutor-v1',
          payerCount: 10000,
          computedPayerCount: 5000,
          status: 'REQUIRES_EVIDENCE',
          totalEligibleDividends: '900000',
          totalReductionExact: '0',
          totalSupportedReduction: null,
          payers,
          blockingPayers: [],
          blockingReasons: [],
        },
      }),
    );
    const renderStart = Date.now();
    await gotoHighIncome(page);
    await expect(page.getByTestId('high-income-payers')).toBeVisible();
    const renderMs = Date.now() - renderStart;

    const filterStart = Date.now();
    await page.getByTestId('high-income-payer-status-filter').selectOption('APPLICABLE');
    await expect(page.getByTestId('high-income-payer-Q0')).toBeVisible();
    const filterMs = Date.now() - filterStart;

    const sortStart = Date.now();
    await page.getByTestId('high-income-payer-sort').selectOption('status');
    await expect(page.getByTestId('high-income-payers')).toBeVisible();
    const sortMs = Date.now() - sortStart;

    const heap = await page.evaluate(() => {
      const performanceWithMemory = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return performanceWithMemory.memory ? performanceWithMemory.memory.usedJSHeapSize : null;
    });

    // eslint-disable-next-line no-console
    console.log(
      `[4I.5 perf] payers=10000 renderMs=${renderMs} filterMs=${filterMs} sortMs=${sortMs} heapBytes=${heap}`,
    );
    expect(renderMs).toBeLessThan(30000);
    expect(filterMs).toBeLessThan(10000);
    expect(sortMs).toBeLessThan(10000);
  });
});
