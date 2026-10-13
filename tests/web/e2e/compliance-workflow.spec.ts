import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Canonical mocks for compliance workflow E2E testing
const SAMPLE_ACTION_ITEM = {
  actionKey: 'subj:2026-03:MONTHLY:fp:PAY_TAX:fp',
  taxSubjectId: 'usr-e2e-1',
  obligationKey: 'usr-e2e-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
  sourceFingerprint: 'f'.repeat(64),
  kind: 'PAY_TAX',
  period: '2026-03',
  calendarYear: 2026,
  exercise: null,
  dueDate: '2026-04-30',
  priority: 'CRITICAL',
  operationalStatus: 'OVERDUE',
  title: 'DARF em atraso — competência 2026-03',
  summary: 'Revise os dados no Atlas antes de pagar pelos canais oficiais.',
  nextAction: 'REVIEW_OBLIGATION',
  actionTarget: '/tax',
  amount: '500.00',
  currency: 'BRL',
  revenueCode: '6015',
  paymentSupportStatus: 'READY',
  paymentEvidenceStatus: 'NO_EVIDENCE',
  reminderStatus: 'SCHEDULED',
  annualReviewStatus: null,
  isStale: false,
  isSuperseded: false,
  blockingReasons: [],
  sourceVersion: '4K.4',
};

const SAMPLE_CALENDAR_EVENT = {
  eventKey: 'k1:OBLIGATION_DUE:2026-04-30',
  taxSubjectId: 'usr-e2e-1',
  obligationKey: 'usr-e2e-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
  actionKey: 'subj:2026-03:MONTHLY:fp:PAY_TAX:fp',
  sourceFingerprint: 'f'.repeat(64),
  eventType: 'OBLIGATION_DUE',
  eventDate: '2026-04-30',
  title: 'DARF a vencer — 2026-03',
  status: 'UPCOMING',
  severity: 'ACTION',
  actionTarget: '/tax',
};

const SAMPLE_PERIOD_CLOSE_READINESS = {
  taxSubjectId: 'usr-e2e-1',
  scope: 'MONTHLY',
  period: '2026-10',
  calendarYear: 2026,
  month: '2026-10',
  exercise: null,
  readiness: 'READY_TO_CLOSE',
  cleanCloseAllowed: true,
  checklist: [
    {
      category: 'OBLIGATIONS_REVIEWED',
      categoryLabel: 'Obrigações e apurações',
      state: 'COMPLETE',
      stateLabel: 'Concluído',
      detail: '1 obrigação revisada',
    },
    {
      category: 'ACTION_ITEMS_RESOLVED',
      categoryLabel: 'Ações do plano de conformidade',
      state: 'COMPLETE',
      stateLabel: 'Concluído',
      detail: 'Todas as ações resolvidas',
    },
    {
      category: 'PAYMENT_SUPPORT_REVIEWED',
      categoryLabel: 'Instruções de pagamento de DARF',
      state: 'COMPLETE',
      stateLabel: 'Concluído',
      detail: 'Instruções geradas',
    },
    {
      category: 'PAYMENT_EVIDENCE_RECONCILED',
      categoryLabel: 'Comprovantes informados',
      state: 'COMPLETE',
      stateLabel: 'Concluído',
      detail: 'Conciliados',
    },
    {
      category: 'STALE_ITEMS_REVIEWED',
      categoryLabel: 'Itens com dados alterados',
      state: 'COMPLETE',
      stateLabel: 'Concluído',
      detail: 'Nenhum item obsoleto',
    },
    {
      category: 'ANNUAL_CONFIRMATIONS_RESOLVED',
      categoryLabel: 'Confirmações do declarante (anual)',
      state: 'NOT_APPLICABLE',
      stateLabel: 'Não aplicável',
      detail: 'Escopo mensal',
    },
    {
      category: 'BLOCKERS_CLEARED',
      categoryLabel: 'Bloqueios e inconsistências',
      state: 'COMPLETE',
      stateLabel: 'Concluído',
      detail: 'Nenhum bloqueio',
    },
  ],
  unresolvedItems: [],
  sourceFingerprint: 'a'.repeat(64),
  centerFingerprint: 'b'.repeat(64),
  evaluatedAt: '2026-04-20T12:00:00.000Z',
  isStaleVsPreviousClose: false,
  previousClose: null,
};

const SAMPLE_PERIOD_CLOSE_RECORD = {
  id: 'close-rec-1',
  taxSubjectId: 'usr-e2e-1',
  scope: 'MONTHLY',
  calendarYear: 2026,
  period: '2026-10',
  month: '2026-10',
  exercise: null,
  revision: 1,
  recordStatus: 'CLOSED',
  sourceFingerprint: 'a'.repeat(64),
  centerFingerprint: 'b'.repeat(64),
  binderFingerprint: 'c'.repeat(64),
  checklistSnapshot: [],
  unresolvedSnapshot: [],
  binderStorageKey: null,
  closedAt: '2026-04-20T12:00:00.000Z',
  reopenedAt: null,
  reason: null,
  createdAt: '2026-04-20T12:00:00.000Z',
};

const SAMPLE_BINDER = {
  scope: 'MONTHLY',
  period: '2026-10',
  calendarYear: 2026,
  exercise: null,
  generatedAtCivilDate: '2026-04-20',
  readinessAtGeneration: 'READY_TO_CLOSE',
  cleanCloseAllowed: true,
  sourceFingerprint: 'a'.repeat(64),
  centerFingerprint: 'b'.repeat(64),
  binderFingerprint: 'c'.repeat(64),
  sections: [
    {
      code: 'PERIOD_IDENTITY',
      title: 'Identidade do período',
      lines: ['Período: 2026-10', 'Escopo: Mensal'],
    },
    {
      code: 'CLOSE_READINESS',
      title: 'Prontidão de fechamento',
      lines: ['Status: Pronto para fechar'],
    },
    {
      code: 'DISCLAIMERS',
      title: 'Avisos legais e limitações',
      lines: ['O Atlas não transmite nem quita DARF perante a Receita Federal.'],
    },
  ],
};

const SAMPLE_OBLIGATION = {
  id: 'ob-1',
  competence: '2026-10',
  taxBucket: 'FII_SALE',
  revenueCode: '6015',
  status: 'OPEN',
  baseStatus: 'OPEN',
  reasonCode: null,
  principalAmount: { amount: '199.9', currency: 'BRL' },
  currency: 'BRL',
  dueDate: '2026-11-30',
  darfReadiness: 'READY',
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

async function setupComplianceHarness(
  page: Page,
  context: BrowserContext,
  overrides: {
    actionCenter?: { data: unknown[]; meta?: unknown };
    calendar?: unknown[];
    readiness?: Record<string, unknown>;
    history?: unknown[];
    binder?: Record<string, unknown>;
  } = {},
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
      body: JSON.stringify({ data: [{ id: 'port-1', name: 'Carteira Principal' }] }),
    }),
  );

  await page.route('**/api/v1/fiscal/**', (route) => {
    const url = route.request().url();

    if (url.includes('/fiscal/compliance/action-center')) {
      const response = overrides.actionCenter ?? {
        data: [SAMPLE_ACTION_ITEM],
        meta: {
          summary: {
            needsAttention: 1,
            overdue: 1,
            dueToday: 0,
            upcoming: 0,
            requiresReview: 0,
            completed: 0,
            annualReview: 0,
            informational: 0,
            total: 1,
          },
          totalCount: 1,
        },
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    }

    if (url.includes('/fiscal/compliance/calendar')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: overrides.calendar ?? [SAMPLE_CALENDAR_EVENT] }),
      });
    }

    if (url.includes('/fiscal/compliance/period-close/readiness')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: overrides.readiness ?? SAMPLE_PERIOD_CLOSE_READINESS }),
      });
    }

    if (url.includes('/fiscal/compliance/period-close/history')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: overrides.history ?? [SAMPLE_PERIOD_CLOSE_RECORD] }),
      });
    }

    if (url.includes('/fiscal/compliance/period-close/binder')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: overrides.binder ?? SAMPLE_BINDER }),
      });
    }

    if (url.includes('/fiscal/compliance?calendarYear')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            taxSubjectId: 'usr-e2e-1',
            calendarYear: 2026,
            obligations: [],
            reminders: [],
            actions: [],
            status: 'COMPLIANT',
            generatedAt: '2026-04-20T12:00:00.000Z',
            summary: {
              totalObligations: 0,
              pendingCount: 0,
              dueSoonCount: 0,
              overdueCount: 0,
              completedCount: 0,
              dismissedCount: 0,
              supersededCount: 0,
              activeCount: 0,
            },
            disclaimer: 'O Atlas é uma ferramenta de apoio gerencial.',
          },
        }),
      });
    }

    if (url.includes('/fiscal/compliance/reminder-preferences')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            remindersEnabled: true,
            upcomingEnabled: true,
            overdueEnabled: true,
            annualEnabled: true,
            leadTimes: [7, 3, 1],
          },
        }),
      });
    }

    if (url.includes('/fiscal/compliance/reminders')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

    if (url.includes('/fiscal/monthly/') && url.includes('/liability')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            competence: '2026-10',
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
            equity: null,
          },
        }),
      });
    }

    if (/\/inputs\/(trade-classifications|withholdings|fii-metadata)/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

    if (url.includes('/fiscal/inputs/')) {
      return route.fulfill({
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
      });
    }

    if (url.includes('/fiscal/obligations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

    if (/\/monthly\/[^/]+\/obligation/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: SAMPLE_OBLIGATION }),
      });
    }

    if (/\/monthly\/[^/]+\/payment-summary/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    }

    if (/\/annual\//.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    }

    if (url.includes('/fiscal/monthly/')) {
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
    }

    // Default safe JSON response for any other fiscal calls
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });
}

test.describe('Tax Compliance Action Center & Period Close E2E (Phase 4K.4 & 4K.5 Fresh Harness)', () => {
  test('Action Center: null or missing meta does not crash the page (Phase 4K.4 Hotfix Reproduction)', async ({
    page,
    context,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => {
      console.info('PAGEERROR:', err.message, err.stack);
      pageErrors.push(err);
    });

    // Exercise formerly crashing condition: response with missing / null meta
    await setupComplianceHarness(page, context, {
      actionCenter: {
        data: [SAMPLE_ACTION_ITEM],
        meta: null,
      },
    });

    await page.goto('/tax');

    // Action center section header must be visible without crash
    await expect(page.getByRole('heading', { name: 'Central de ações fiscais' })).toBeVisible();

    // The item itself is safely rendered
    await expect(page.getByText('DARF em atraso — competência 2026-03')).toBeVisible();

    // No uncaught errors occurred
    expect(pageErrors).toHaveLength(0);
  });

  test('Action Center: loads action items, summary badge counters and calendar grid', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context);
    await page.goto('/tax');

    await expect(page.getByRole('heading', { name: 'Central de ações fiscais' })).toBeVisible();
    await expect(page.getByTestId('action-center-summary')).toBeVisible();
    await expect(page.getByText('Atenção: 1')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendário fiscal' })).toBeVisible();
  });

  test('Action Center: filters action items by status and priority', async ({ page, context }) => {
    await setupComplianceHarness(page, context);
    await page.goto('/tax');

    const statusFilter = page.getByLabel('Filtrar por status');
    await expect(statusFilter).toBeVisible();
    await statusFilter.selectOption('OVERDUE');

    const priorityFilter = page.getByLabel('Filtrar por prioridade');
    await expect(priorityFilter).toBeVisible();
    await priorityFilter.selectOption('CRITICAL');
  });

  test('Action Center: renders empty state when no items require attention', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context, {
      actionCenter: {
        data: [],
        meta: { summary: { total: 0 } },
      },
    });
    await page.goto('/tax');

    await expect(page.getByText('Nenhuma ação fiscal pendente')).toBeVisible();
  });

  test('Action Center: renders stale warning message when source items are marked stale', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context, {
      actionCenter: {
        data: [{ ...SAMPLE_ACTION_ITEM, isStale: true }],
        meta: { summary: { needsAttention: 1, total: 1 } },
      },
    });
    await page.goto('/tax');

    await expect(page.getByText(/foram alterados/i)).toBeVisible();
  });

  test('Period Close: evaluates monthly close readiness checklist and displays close action', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context);
    await page.goto('/tax');

    await expect(page.getByRole('heading', { name: 'Fechamento de período fiscal' })).toBeVisible();
    await expect(page.getByTestId('period-close-readiness')).toBeVisible();
    await expect(
      page.getByTestId('period-close-readiness').getByText('Pronto para fechar'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fechar período' })).toBeVisible();
  });

  test('Period Close: switches between monthly and annual period close scopes', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context);
    await page.goto('/tax');

    const scopeSelect = page.getByLabel('Escopo do fechamento');
    await expect(scopeSelect).toBeVisible();

    // Default is Monthly
    await expect(page.getByLabel('Competência do fechamento')).toBeVisible();

    // Switch to Annual
    await scopeSelect.selectOption('ANNUAL');
    await expect(page.getByLabel('Ano-calendário do fechamento')).toBeVisible();
  });

  test('Period Close: displays evidence binder and supports structured export', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context);
    await page.goto('/tax');

    await expect(page.getByText('Dossiê de evidências')).toBeVisible();
    await expect(page.getByRole('button', { name: /CSV/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /JSON/i })).toBeVisible();
  });

  test('Period Close: displays close history and allows reopening a closed period', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context);
    await page.goto('/tax');

    await expect(page.getByText('Histórico de fechamentos')).toBeVisible();
    await expect(page.getByText('Fechado')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reabrir/i })).toBeVisible();
  });

  test('Period Close: displays stale close warning when source data changes after close', async ({
    page,
    context,
  }) => {
    await setupComplianceHarness(page, context, {
      readiness: {
        ...SAMPLE_PERIOD_CLOSE_READINESS,
        readiness: 'STALE',
        isStaleVsPreviousClose: true,
        cleanCloseAllowed: false,
      },
    });
    await page.goto('/tax');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByText(/ficou desatualizado porque os dados de origem mudaram/i),
    ).toBeVisible();
  });
});
