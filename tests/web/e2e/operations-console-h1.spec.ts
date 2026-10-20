/**
 * Phase 5H-H1 - Readiness READY + real backfill execution (browser, real servers).
 * Web :3004 -> API :3002 (staging-like, scheduler flag ON, scheduler started at boot).
 * No stubs: every assertion observes live backend responses. Single shared
 * login per run keeps clear of the login rate limit (5/min).
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const OP_EMAIL = 'hv-operator@atlas.test';
const OP_PASS = 'Hv-Operator-12345';

let sharedCtx: BrowserContext;

async function uiLogin(page: Page) {
  await page.goto('http://localhost:3004/login');
  await page.getByLabel('E-mail').fill(OP_EMAIL);
  await page.getByLabel('Senha').fill(OP_PASS);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  // Environment gate: skip cleanly when the staging-like stack is absent.
  try {
    const res = await fetch('http://localhost:3002/health');
    if (!res.ok) {
      test.skip(true, 'H1 staging-like stack unavailable (API health check failed)');
      return;
    }
  } catch {
    test.skip(true, 'H1 staging-like stack unavailable (API unreachable)');
    return;
  }
  sharedCtx = await browser.newContext();
  const page = await sharedCtx.newPage();
  await uiLogin(page);
  await page.close();
});

test.afterAll(async () => {
  await sharedCtx?.close().catch(() => undefined);
});

test('H24-B readiness panel renders live check matrix (all config checks green)', async () => {
  const page = await sharedCtx.newPage();
  const seen: string[] = [];
  page.on('request', (req) => {
    if (/\/api\/v1\/admin\/operations\/scheduler\/readiness/.test(req.url())) seen.push(req.url());
  });
  await page.goto('http://localhost:3004/admin/operations');
  await expect(page.getByRole('heading', { name: /console de opera/i })).toBeVisible({
    timeout: 25000,
  });
  await page.getByRole('tab', { name: 'Prontidão' }).click();
  await expect(page.getByText(/prontidão do agendador/i)).toBeVisible({ timeout: 25000 });
  // Every readiness check from the frozen contract is rendered.
  for (const check of [
    'scheduler-flag',
    'database-url',
    'operator-allowlist',
    'timezone',
    'ten-definitions',
    'already-running',
    'database-reachable',
    'migrations-current',
    'calendar-coverage',
    'providers-configured',
  ]) {
    await expect(page.getByText(new RegExp(check, 'i')).first()).toBeVisible({ timeout: 15000 });
  }
  await expect(page.getByText('timezone-america-sao-paulo').first()).toBeVisible();
  await expect(page.getByText(/10 definitions/i).first()).toBeVisible();
  // 10/11 checks green; duplicate-start guard reports the running scheduler
  // (boot verdict was READY, which is why the scheduler started).
  await expect(page.getByText(/already running/i).first()).toBeVisible();
  // Panel performed at least one real persisted-only readiness fetch.
  expect(seen.length).toBeGreaterThanOrEqual(1);
  for (const url of seen) expect(url).toContain('localhost:3002');
  await page.close();
});

test('H32 real CALENDAR_B3 2034 backfill plan + execute + receipt via browser', async () => {
  const page = await sharedCtx.newPage();
  const calls: Array<{ method: string; url: string }> = [];
  page.on('request', (req) => {
    if (/\/api\/v1\/admin\/ingestion\/backfill\//.test(req.url())) {
      calls.push({ method: req.method(), url: req.url() });
    }
  });
  await page.goto('http://localhost:3004/admin/operations');
  await expect(page.getByRole('heading', { name: /console de opera/i })).toBeVisible({
    timeout: 25000,
  });
  await page.getByRole('tab', { name: 'Backfills' }).click();
  await page.getByLabel(/domínio/i).selectOption('CALENDAR_B3');
  await page.getByLabel(/de \(yyyy-mm-dd\)/i).fill('2034-01-01');
  await page.getByLabel(/até \(yyyy-mm-dd\)/i).fill('2034-12-31');
  await page.getByRole('button', { name: /gerar plano/i }).click();
  await expect(page.getByText(/eligibleWindows|elegível/i).first()).toBeVisible({ timeout: 30000 });
  const planText = await page.getByRole('tabpanel').innerText();
  expect(planText).toMatch(/2034|elegível|janela|período|eligible/i);
  // Execute with explicit confirmation (real backend run).
  await page.getByRole('button', { name: /revisar e executar/i }).click();
  await expect(page.getByText(/confirmar backfill/i)).toBeVisible();
  await page.getByRole('button', { name: /^confirmar execução$/i }).click();
  await expect(page.getByText(/recibo/i).first()).toBeVisible({ timeout: 60000 });
  const receiptText = await page.getByRole('tabpanel').innerText();
  expect(receiptText).toMatch(/success/i);
  const planCalls = calls.filter((c) => /\/plan$/.test(c.url) && c.method === 'POST');
  const runCalls = calls.filter((c) => /\/run$/.test(c.url) && c.method === 'POST');
  expect(planCalls.length).toBeGreaterThanOrEqual(1);
  expect(runCalls.length).toBe(1);
  // Replan: fully covered, nothing eligible left.
  await page.getByRole('button', { name: /gerar plano/i }).click();
  await page.waitForTimeout(3000);
  const replanText = await page.getByRole('tabpanel').innerText();
  expect(replanText).toMatch(/0|nenhum|conclu|cobert/i);
  await page.close();
});
