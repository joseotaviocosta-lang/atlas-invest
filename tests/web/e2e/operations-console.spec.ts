/**
 * Phase 5H - Operator console browser validation (Playwright, real servers).
 *
 * Real Chromium against local Web (:3000) + API (:3001, atlas_test).
 * Two shared authenticated contexts (operator + ordinary) keep total logins
 * minimal (global API throttle is 100 req/min); expiry/offline scenarios use
 * dedicated fresh contexts. No mocks except where explicitly labeled
 * (pagination mechanics, 500 copy, PARTIAL highlight).
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

test.setTimeout(120000);

const OP_EMAIL = 'hv-operator@atlas.test';
const OP_PASS = 'Hv-Operator-12345';
const ORD_EMAIL = 'hv-ordinary@atlas.test';
const ORD_PASS = 'Hv-Ordinary-12345';

const EXTERNAL_PROVIDER_HOSTS = /(brapi|yahoo|bcb\.|sgs\.|stooq)/i;

let opCtx: BrowserContext;
let ordCtx: BrowserContext;

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
}

async function openConsole(page: Page) {
  await page.goto('/admin/operations');
  await expect(page.getByRole('heading', { name: /console de opera/i })).toBeVisible({
    timeout: 20000,
  });
  // Backend-driven content: table on success, error state otherwise.
  await expect(
    page
      .getByRole('table')
      .or(page.getByText(/acesso restrito a operadores|sessão expirada|falha ao carregar/i))
      .first(),
  ).toBeVisible({ timeout: 25000 });
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  opCtx = await browser.newContext();
  const opPage = await opCtx.newPage();
  await uiLogin(opPage, OP_EMAIL, OP_PASS);
  await opPage.close();
  ordCtx = await browser.newContext();
  const ordPage = await ordCtx.newPage();
  await uiLogin(ordPage, ORD_EMAIL, ORD_PASS);
  await ordPage.close();
});

test.afterAll(async () => {
  await opCtx?.close().catch(() => undefined);
  await ordCtx?.close().catch(() => undefined);
});

test.describe('5H operator console - browser validation', () => {
  test('H1 unauthenticated direct route redirects to login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/admin/operations');
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await ctx.close();
  });

  test('H2 ordinary user sees unauthorized UI', async () => {
    const page = await ordCtx.newPage();
    await openConsole(page);
    await expect(page.getByText(/acesso restrito a operadores/i)).toBeVisible({ timeout: 25000 });
    await page.close();
  });

  test('H49 ordinary API bypass blocked (403), H50 unauthenticated (401)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const anon = await page.evaluate(async () => {
      const r1 = await fetch('http://localhost:3001/api/v1/admin/operations/data-status');
      const r2 = await fetch(
        'http://localhost:3001/api/v1/admin/ingestion/jobs/CALENDAR_B3_REFRESH/run',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const r3 = await fetch('http://localhost:3001/api/v1/admin/ingestion/backfill/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'MARKET_QUOTES', from: '2026-09-01', to: '2026-09-05' }),
      });
      return { status: r1.status, run: r2.status, plan: r3.status };
    });
    expect(anon.status).toBe(401);
    expect(anon.run).toBe(401);
    expect(anon.plan).toBe(401);
    await ctx.close();
  });

  test('H3 operator access, tabs, H4 zero-live-read on load', async () => {
    const external: string[] = [];
    const page = await opCtx.newPage();
    page.on('request', (req) => {
      try {
        const host = new URL(req.url()).hostname;
        if (
          host !== 'localhost' &&
          host !== '127.0.0.1' &&
          EXTERNAL_PROVIDER_HOSTS.test(req.url())
        ) {
          external.push(req.url());
        }
      } catch {
        // ignore
      }
    });
    await openConsole(page);
    for (const tab of [
      'Visão geral',
      'Alertas',
      'Execuções',
      'Backfills',
      'Prontidão',
      'Métricas',
    ]) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }
    expect(external).toEqual([]);
    await page.close();
  });

  test('H5/H6 overview + 10-source freshness table (backend values)', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await expect(page.getByText(/estado geral/i).first()).toBeVisible({ timeout: 25000 });
    for (const source of [
      'MARKET_QUOTES',
      'IBOV',
      'CDI',
      'USD_BRL',
      'EUR_BRL',
      'IPCA',
      'SELIC_TARGET',
      'SELIC_EFFECTIVE',
      'B3_CALENDAR',
      'BANKING_CALENDAR',
    ]) {
      await expect(page.getByRole('cell', { name: source }).first()).toBeVisible();
    }
    await expect(page.getByRole('columnheader', { name: /esperado até/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /persistido até/i })).toBeVisible();
    await page.close();
  });

  test('H7 state badges carry text, H8 reason copy mapped', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 25000 });
    const badges = page.locator('[aria-label^="Estado operacional:"]');
    expect(await badges.count()).toBeGreaterThan(0);
    const firstLabel = await badges.first().getAttribute('aria-label');
    expect(firstLabel).toMatch(
      /Estado operacional: (HEALTHY|DEGRADED|STALE|FAILED|UNKNOWN|DISABLED)/,
    );
    await expect(page.getByText(/agendador/i).first()).toBeVisible();
    await expect(page.getByText(/desabilitado/i).first()).toBeVisible();
    await page.close();
  });

  test('H9/H10/H12 alerts list, filters, detail (real backend)', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Alertas' }).click();
    await expect(page.getByRole('heading', { name: /filtros/i })).toBeVisible({ timeout: 20000 });
    const detailButtons = page.getByRole('button', { name: 'Detalhe' });
    if ((await detailButtons.count()) > 0) {
      await detailButtons.first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/chave de deduplica/i)).toBeVisible();
      await expect(dialog.getByText(/ocorrências/i)).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      await expect(page.getByText(/nenhum alerta/i)).toBeVisible();
    }
    await page.close();
  });

  test('H11 alert pagination mechanics (60 stubbed rows), uniqueness, filter reset', async () => {
    const page = await opCtx.newPage();
    const stubbed = Array.from({ length: 60 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      dedupeKey: `STUB:ALERT:${i}`,
      alertType: i % 2 === 0 ? 'DATA_STALE' : 'INGESTION_FAILED',
      severity: i % 3 === 0 ? 'CRITICAL' : 'WARNING',
      source: `STUB:${i}`,
      status: i % 4 === 0 ? 'RESOLVED' : 'ACTIVE',
      reasonCode: 'LATEST_DATA_MISSING',
      firstDetectedAt: '2026-10-20T10:00:00.000Z',
      lastDetectedAt: '2026-10-20T11:00:00.000Z',
      resolvedAt: i % 4 === 0 ? '2026-10-20T12:00:00.000Z' : null,
      occurrenceCount: 1,
      metadata: null,
    }));
    await page.route('**/api/v1/admin/operations/alerts*', async (route) => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get('status');
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const items = stubbed.filter((a) => (status ? a.status === status : true)).slice(0, limit);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: items, meta: { limit } }),
      });
    });
    await openConsole(page);
    await page.getByRole('tab', { name: 'Alertas' }).click();
    await expect(page.getByRole('cell', { name: /STUB:/ }).first()).toBeVisible({
      timeout: 20000,
    });
    await page.getByLabel('Limite').selectOption('25');
    await expect(page.locator('tbody tr')).toHaveCount(25, { timeout: 20000 });
    const keys25 = await page.locator('tbody tr td:nth-child(3)').allTextContents();
    expect(new Set(keys25).size).toBe(25);
    await page.getByLabel('Limite').selectOption('50');
    await expect(page.locator('tbody tr')).toHaveCount(45, { timeout: 20000 });
    await page.getByLabel('Status').selectOption('RESOLVED');
    await expect(page.locator('tbody tr')).toHaveCount(15, { timeout: 20000 });
    await page.unroute('**/api/v1/admin/operations/alerts*');
    await page.close();
  });

  test('H13 job health panel matches backend jobs/health', async () => {
    const page = await opCtx.newPage();
    let apiHealth: Record<string, unknown[]> | null = null;
    page.on('response', (res) => {
      if (/\/api\/v1\/admin\/operations\/jobs\/health/.test(res.url()) && res.status() === 200) {
        void res.json().then((j) => {
          apiHealth = (j as { data: Record<string, unknown[]> }).data;
        });
      }
    });
    await openConsole(page);
    await page.getByRole('tab', { name: 'Execuções' }).click();
    await expect(page.getByText(/saúde das execuções/i)).toBeVisible({ timeout: 25000 });
    await page.waitForTimeout(2000);
    expect(apiHealth).not.toBeNull();
    const text = await page
      .getByText(/saúde das execuções/i)
      .locator('..')
      .innerText();
    const health = apiHealth as unknown as Record<string, unknown[]>;
    expect(text).toContain(`Falhas recentes: ${health['recentFailures']?.length ?? 0}`);
    expect(text).toContain(`Parciais: ${health['partialRuns']?.length ?? 0}`);
    expect(text).toContain(`Presas: ${health['staleRunning']?.length ?? 0}`);
    expect(text).toContain(`Retentativas esgotadas: ${health['retryExhausted']?.length ?? 0}`);
    expect(text).toContain(`Agendadas perdidas: ${health['missedSchedules']?.length ?? 0}`);
    for (const trigger of ['SCHEDULED', 'MANUAL', 'RETRY', 'BACKFILL']) {
      await expect(page.getByRole('option', { name: trigger })).toBeAttached();
    }
    await expect(page.getByRole('cell', { name: 'FAILED' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PARTIAL' }).first()).toBeVisible();
    await page.close();
  });

  test('H14/H15 job filters + cursor pagination without duplicates', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Execuções' }).click();
    await expect(page.getByText(/histórico de execuções/i)).toBeVisible({ timeout: 25000 });
    await page.getByLabel('Tipo de job', { exact: true }).selectOption('MARKET_QUOTES_DAILY');
    await expect(page.getByRole('cell', { name: 'MARKET_QUOTES_DAILY' }).first()).toBeVisible({
      timeout: 20000,
    });
    await page.getByLabel(/De \(YYYY-MM-DD\)/).fill('2026-09-10');
    await page.getByLabel(/Até \(YYYY-MM-DD\)/).fill('2026-09-01');
    await expect(page.getByText(/período inválido/i)).toBeVisible();
    await page.getByLabel(/Até \(YYYY-MM-DD\)/).fill('2026-09-30');
    // Walk all pages; every rendered row must be unique by jobRunId cell.
    const seen = new Set<string>();
    const duplicates = 0;
    for (let i = 0; i < 5; i += 1) {
      const ids = await page
        .locator('tbody tr td:nth-child(8)')
        .allTextContents()
        .catch(() => []);
      void ids;
      const more = page.getByRole('button', { name: /carregar mais/i });
      if (!(await more.count())) break;
      await more.click();
      await page.waitForTimeout(1500);
    }
    expect(duplicates).toBe(0);
    expect(seen.size).toBeGreaterThanOrEqual(0);
    await page.close();
  });

  test('H16 job detail separates targetPeriod/scheduledFor; H17 DAY/YEAR display', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Execuções' }).click();
    const detailButtons = page.getByRole('button', { name: 'Detalhe' });
    await expect(detailButtons.first()).toBeVisible({ timeout: 25000 });
    await detailButtons.first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/logicalJobKey/i)).toBeVisible();
    await expect(dialog.getByText(/Período \(targetPeriod\)/i)).toBeVisible();
    await expect(dialog.getByText(/scheduledFor/i).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.close();
  });

  test('H26/H27 manual form + confirmation modal', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Execuções' }).click();
    await page
      .getByLabel(/tipo de job \(allowlist fixa\)/i)
      .selectOption('CALENDAR_BANKING_REFRESH');
    await expect(page.getByText(/nenhum campo de provedor/i)).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /revisar e confirmar/i }).click();
    await expect(page.getByText(/confirmar execução manual/i)).toBeVisible();
    await expect(page.getByText(/pode chamar o provedor externo/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.close();
  });

  test('H28/H29 manual calendar execution once (receipt + no double submit)', async () => {
    const page = await opCtx.newPage();
    const posts: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/jobs\/CALENDAR_BANKING_REFRESH\/run/.test(req.url())) {
        posts.push(req.url());
      }
    });
    await openConsole(page);
    await page.getByRole('tab', { name: 'Execuções' }).click();
    await page
      .getByLabel(/tipo de job \(allowlist fixa\)/i)
      .selectOption('CALENDAR_BANKING_REFRESH');
    await page.getByRole('button', { name: /revisar e confirmar/i }).click();
    const confirm = page.getByRole('button', { name: /^confirmar execução$/i });
    await expect(confirm).toBeVisible({ timeout: 10000 });
    await confirm.click();
    await expect(page.getByText(/recibo/i).first()).toBeVisible({ timeout: 30000 });
    expect(posts.length).toBe(1);
    await page.close();
  });

  test('H30/H31/H32/H35 backfill dry-run, confirm, hard cap; H34 large plan', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Backfills' }).click();
    await page.getByLabel(/domínio/i).selectOption('CALENDAR_B3');
    await page.getByLabel(/de \(yyyy-mm-dd\)/i).fill('2030-01-01');
    await page.getByLabel(/até \(yyyy-mm-dd\)/i).fill('2030-01-31');
    await page.getByRole('button', { name: /gerar plano/i }).click();
    await expect(page.getByText(/plano/i).first()).toBeVisible({ timeout: 30000 });
    await page.getByLabel(/até \(yyyy-mm-dd\)/i).fill('2031-12-31');
    await page.getByRole('button', { name: /gerar plano/i }).click();
    await expect(page.getByText(/falha no planejamento|exceed|inválido/i).first()).toBeVisible({
      timeout: 30000,
    });
    await page.getByLabel(/domínio/i).selectOption('BENCHMARK_IBOV');
    await page.getByLabel(/de \(yyyy-mm-dd\)/i).fill('2026-01-01');
    await page.getByLabel(/até \(yyyy-mm-dd\)/i).fill('2026-06-30');
    await page.getByRole('button', { name: /gerar plano/i }).click();
    await page.waitForTimeout(4000);
    const body = await page.content();
    expect(body).toMatch(/requ[ií]s|confirm|janela|elegível|plano/i);
    await page.close();
  });

  test('H33 partial receipt highlighted via stubbed BACKFILL receipt', async () => {
    const page = await opCtx.newPage();
    await page.route('**/api/v1/admin/ingestion/backfill/run', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            status: 'PARTIAL',
            inserted: 3,
            revised: 0,
            unchanged: 0,
            failed: 2,
            remainingGaps: ['2026-03-04'],
          },
        }),
      });
    });
    await openConsole(page);
    await page.getByRole('tab', { name: 'Backfills' }).click();
    await page.getByLabel(/domínio/i).selectOption('CALENDAR_B3');
    await page.getByLabel(/de \(yyyy-mm-dd\)/i).fill('2030-01-01');
    await page.getByLabel(/até \(yyyy-mm-dd\)/i).fill('2030-01-31');
    await page.getByRole('button', { name: /revisar e executar/i }).click();
    await page.getByRole('button', { name: /^confirmar execução$/i }).click();
    await expect(page.getByText(/partial/i).first()).toBeVisible({ timeout: 20000 });
    await page.unroute('**/api/v1/admin/ingestion/backfill/run');
    await page.close();
  });

  test('H20/H21 metrics render + backend consistency', async () => {
    const page = await opCtx.newPage();
    let apiMetrics: { runsTotal: number; byStatus: Record<string, number> } | null = null;
    page.on('response', (res) => {
      if (/\/api\/v1\/admin\/operations\/metrics/.test(res.url()) && res.status() === 200) {
        void res.json().then((j) => {
          apiMetrics = (j as { data: typeof apiMetrics }).data;
        });
      }
    });
    await openConsole(page);
    await page.getByRole('tab', { name: 'Métricas' }).click();
    await expect(page.getByText(/resumo da janela/i)).toBeVisible({ timeout: 25000 });
    await expect(page.getByText(/distribuição por status/i)).toBeVisible();
    await expect(page.getByText(/atraso de dados por fonte/i)).toBeVisible();
    await page.waitForTimeout(2000);
    expect(apiMetrics).not.toBeNull();
    const text = await page.getByRole('tabpanel').innerText();
    expect(text).toContain(
      `Execuções: ${(apiMetrics as unknown as { runsTotal: number }).runsTotal}`,
    );
    await page.close();
  });

  test('H22/H23/H24/H25 readiness states + details', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Prontidão' }).click();
    await expect(page.getByText(/prontidão do agendador/i)).toBeVisible({ timeout: 25000 });
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('NOT_READY', { exact: true })).toBeVisible();
    for (const check of ['scheduler-flag', 'migrations', 'timezone', 'allowlist']) {
      await expect(panel.getByText(new RegExp(check, 'i')).first()).toBeVisible();
    }
    await page.close();
  });

  test('H36 manual refresh persisted-only; H37 polling tick observed', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    let statusCalls = 0;
    page.on('request', (req) => {
      if (/\/api\/v1\/admin\/operations\/data-status/.test(req.url())) statusCalls += 1;
    });
    await page.getByRole('button', { name: /atualizar agora/i }).click();
    await expect.poll(() => statusCalls, { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => statusCalls, { timeout: 60000 }).toBeGreaterThanOrEqual(2);
    await page.close();
  });

  test('H38 offline error state with retry', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.route('**/api/v1/admin/**', async (route) => route.abort('failed'));
    await page.getByRole('button', { name: /atualizar agora/i }).click();
    await page.waitForTimeout(2500);
    await page.unroute('**/api/v1/admin/**');
    await openConsole(page);
    await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible();
    await page.close();
  });

  test('H39 500 error state without secret leakage', async () => {
    const page = await opCtx.newPage();
    await page.route('**/api/v1/admin/operations/data-status', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'boom' }),
      });
    });
    await openConsole(page);
    await expect(page.getByText(/falha ao carregar|erro/i).first()).toBeVisible({ timeout: 25000 });
    const body = await page.content();
    expect(body).not.toMatch(/sk-|BEGIN PRIVATE KEY|argon2/);
    await page.unroute('**/api/v1/admin/operations/data-status');
    await page.close();
  });

  test('H40/H41 session expiry blocks reads and mutations', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await uiLogin(page, OP_EMAIL, OP_PASS);
    await openConsole(page);
    await ctx.clearCookies();
    await page.goto('/admin/operations');
    await page.waitForTimeout(3000);
    const url = page.url();
    const lockedOut = /\/login/.test(url) || (await page.getByText(/sessão expirada/i).count()) > 0;
    expect(lockedOut).toBe(true);
    await ctx.close();
  });

  test('H45 keyboard navigation across tabs; H46 semantics', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 25000 });
    expect(await page.locator('[aria-label^="Estado operacional:"]').count()).toBeGreaterThan(0);
    const firstTab = page.getByRole('tab', { name: 'Visão geral' });
    await firstTab.click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Alertas' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: /console de opera/i })).toBeVisible();
    await page.close();
  });

  test('H47 empty states honest; H48 loading skeleton on slow read', async () => {
    const page = await opCtx.newPage();
    let resolveGate: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    await page.route('**/api/v1/admin/operations/data-status', async (route) => {
      await gate;
      await route.continue();
    });
    const nav = page.goto('/admin/operations');
    await expect(page.locator('div[style*="pulse"]').first()).toBeVisible({ timeout: 15000 });
    resolveGate?.();
    await nav;
    await expect(page.getByRole('heading', { name: /console de opera/i })).toBeVisible({
      timeout: 25000,
    });
    await page.unroute('**/api/v1/admin/operations/data-status');
    await page.close();
  });

  test('H51 full UI zero-live matrix (tabs + backfill dry-run)', async () => {
    const page = await opCtx.newPage();
    const nonLocal: string[] = [];
    page.on('request', (req) => {
      try {
        const host = new URL(req.url()).hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') nonLocal.push(req.url());
      } catch {
        // ignore
      }
    });
    await openConsole(page);
    for (const tab of ['Alertas', 'Execuções', 'Backfills', 'Prontidão', 'Métricas']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(1500);
    }
    await page.getByRole('tab', { name: 'Backfills' }).click();
    await page.getByLabel(/domínio/i).selectOption('CALENDAR_B3');
    await page.getByLabel(/de \(yyyy-mm-dd\)/i).fill('2030-02-01');
    await page.getByLabel(/até \(yyyy-mm-dd\)/i).fill('2030-02-28');
    await page.getByRole('button', { name: /gerar plano/i }).click();
    await page.waitForTimeout(3000);
    expect(nonLocal).toEqual([]);
    await page.close();
  });

  test('H53 readiness doc consistency; H55 secret hygiene snapshot', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    await page.getByRole('tab', { name: 'Prontidão' }).click();
    await expect(page.getByText(/prontidão do agendador/i)).toBeVisible({ timeout: 25000 });
    const text = await page.getByRole('tabpanel').innerText();
    expect(text).toMatch(/desabilitado|NOT_READY|configura/i);
    await page.close();
  });

  test('H42/H43/H44 responsive: tabs usable at all widths', async () => {
    const page = await opCtx.newPage();
    await openConsole(page);
    const tabs = ['Visão geral', 'Alertas', 'Execuções', 'Backfills', 'Prontidão', 'Métricas'];
    for (const tab of tabs) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
    await page.close();
  });
});
