import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Real Browser Production-Like Smoke against Built Runtime', () => {
  test.use({ baseURL: 'http://localhost:3000' });

  test('executes 26-step comprehensive browser smoke', async ({ page, context }) => {
    // 1. open production-built Web login page
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Entrar na sua conta' })).toBeVisible();

    // 2. login synthetic owner
    await page.getByLabel('E-mail').fill('synthetic.owner@atlas.dev');
    await page.getByLabel('Senha').fill('AtlasSecureOwner2026!');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Verify redirect to /today or /onboarding (synthetic owner has no portfolios initially)
    await page.waitForURL(/\/(today|onboarding)/);

    // 3. reload protected page
    await page.reload();
    await expect(page).toHaveURL(/\/(today|onboarding)/);

    // 4. confirm session persists
    const cookies = await context.cookies();
    const refreshCookie = cookies.find((c) => c.name === 'atlas_refresh');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.httpOnly).toBe(true);
    expect(refreshCookie!.sameSite).toBe('Lax');
    expect(refreshCookie!.path).toBe('/');

    // 5. create portfolio through Web
    await page.goto('/portfolio');
    await page.getByRole('button', { name: '+ Nova Carteira' }).click();
    await page.getByLabel('Nome da Carteira').fill('Carteira Real Smoke');
    await page.getByRole('button', { name: 'Salvar Carteira' }).click();
    await expect(page.getByRole('heading', { name: 'Carteira Real Smoke' }).first()).toBeVisible();

    // 6. create account through Web
    await page.goto('/portfolio/accounts');
    await page.getByRole('button', { name: '+ Nova conta' }).click();
    await page.getByLabel('Nome da Conta').fill('Conta XP Smoke');
    await page.getByRole('button', { name: 'Salvar Conta' }).click();
    await expect(page.getByText('Conta XP Smoke', { exact: true })).toBeVisible();

    // 7. create BUY through Web
    await page.goto('/portfolio');
    await page.getByRole('tab', { name: 'Operações' }).click();
    await page.getByRole('button', { name: '+ Nova operação' }).click();
    await page.getByLabel('Tipo de Operação').selectOption('BUY');
    await page.getByLabel('Quantidade').fill('100');
    await page.getByLabel('Preço Unitário').fill('30,00');
    await page.getByLabel('Data da Operação').fill('2026-03-02');
    await page.getByRole('button', { name: 'Salvar Operação' }).click();
    await expect(page.getByText('Operação registrada com sucesso!')).toBeVisible();

    // 8. create second BUY through Web
    await page.getByRole('button', { name: '+ Nova operação' }).click();
    await page.getByLabel('Tipo de Operação').selectOption('BUY');
    await page.getByLabel('Quantidade').fill('50');
    await page.getByLabel('Preço Unitário').fill('36,00');
    await page.getByLabel('Data da Operação').fill('2026-03-05');
    await page.getByRole('button', { name: 'Salvar Operação' }).click();
    await expect(page.getByText('Operação registrada com sucesso!').first()).toBeVisible();

    // 9. create SELL through Web
    await page.getByRole('button', { name: '+ Nova operação' }).click();
    await page.getByLabel('Tipo de Operação').selectOption('SELL');
    await page.getByLabel('Quantidade').fill('40');
    await page.getByLabel('Preço Unitário').fill('35,00');
    await page.getByLabel('Data da Operação').fill('2026-03-10');
    await page.getByRole('button', { name: 'Salvar Operação' }).click();
    await expect(page.getByText('Operação registrada com sucesso!').first()).toBeVisible();

    // 10. verify derived position visible in Web
    await page.getByRole('tab', { name: 'Ativos' }).click();
    // Total quantity: 100 + 50 - 40 = 110
    await expect(page.getByText('Qtd 110')).toBeVisible();

    // 11. correct/rectify disposable transaction through Web
    await page.getByRole('tab', { name: 'Operações' }).click();
    // Click "Corrigir" on the first available operation
    const correctBtn = page.getByRole('button', { name: 'Corrigir' }).first();
    await correctBtn.click();
    await expect(
      page.getByRole('heading', { name: 'Corrigir Operação no Livro-Razão' }),
    ).toBeVisible();
    await page
      .getByLabel('Motivo da Correção (opcional)')
      .fill('Ajuste de quantidade por nota de corretagem');
    await page.getByLabel('Quantidade Corrigida').fill('95');
    await page.getByRole('button', { name: 'Confirmar Retificação' }).click();
    await expect(
      page.getByText('Operação retificada com sucesso!', { exact: false }).first(),
    ).toBeVisible();

    // 12. verify original + compensation + replacement visible
    await expect(page.getByText('Compensação').first()).toBeVisible();
    await expect(page.getByText('Correção').first()).toBeVisible();
    await expect(page.getByText('Corrigida').first()).toBeVisible();

    // 13. open Rentabilidade through Portfolio tab
    await page.getByRole('tab', { name: 'Rentabilidade' }).click();
    await expect(page).toHaveURL(/\/portfolio\/performance/);

    // 14. confirm Portfolio shell remains visible
    await expect(page.getByRole('tab', { name: 'Visão Geral' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Rentabilidade' })).toBeVisible();

    // 15. confirm honest no-market-data state if no quotes
    await expect(
      page.getByText(/Rentabilidade e Retornos da Carteira|Retorno no Período|Benchmark/),
    ).toBeVisible();

    // 16. open Proventos through Portfolio tab
    await page.getByRole('tab', { name: 'Proventos' }).click();
    await expect(page).toHaveURL(/\/portfolio\/income/);

    // 17. create manual provento through Web
    await page.goto('/portfolio?tab=operations');
    await page.getByRole('button', { name: '+ Nova operação' }).click();
    await page.getByLabel('Tipo de Operação').selectOption('DIVIDEND');
    await page.getByLabel('Valor do Rendimento (Líquido / Creditado)').fill('150,00');
    await page.getByLabel('Data da Operação').fill('2026-03-20');
    await page.getByRole('button', { name: 'Salvar Operação' }).click();
    await expect(page.getByText('Operação registrada com sucesso!').first()).toBeVisible();

    // 18. verify provento visible in income tab
    await page.goto('/portfolio/income');
    await expect(page.getByText('R$ 150,00').first()).toBeVisible();

    // 19. open Fiscal through Web
    await page.goto('/tax');
    await expect(page.getByRole('heading', { name: 'Fiscal' })).toBeVisible();

    // 20. verify monthly section loads
    await expect(page.getByText('Diagnóstico de fundação (Fase').first()).toBeVisible();

    // 21. open Annual IRPF for 2026
    await page.selectOption('#reporting-year-select', '2026');
    await expect(page.getByTestId('export-reporting-csv-btn')).toBeVisible({ timeout: 10000 });

    // 22. trigger CSV export through Web
    // 23. wait for real browser download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-reporting-csv-btn').click(),
    ]);

    expect(download.suggestedFilename()).toBe('atlas-suporte-irpf-2026.csv');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Validate CSV file format invariants
    const csvBuffer = fs.readFileSync(downloadPath!);
    // Check UTF-8 BOM: EF BB BF
    expect(csvBuffer[0]).toBe(0xef);
    expect(csvBuffer[1]).toBe(0xbb);
    expect(csvBuffer[2]).toBe(0xbf);

    const csvContent = csvBuffer.toString('utf-8');
    expect(csvContent).toContain(';');
    expect(csvContent).toContain('\r\n');
    expect(csvContent).toContain('Bens e Direitos');

    // 24. logout
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await page.waitForURL(/\/login/);

    // 25. login again
    await page.getByLabel('E-mail').fill('synthetic.owner@atlas.dev');
    await page.getByLabel('Senha').fill('AtlasSecureOwner2026!');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/today/);

    // 26. verify protected session works again
    await expect(page.getByText('Olá, Synthetic')).toBeVisible();
  });
});
