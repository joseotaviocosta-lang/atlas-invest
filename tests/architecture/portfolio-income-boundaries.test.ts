import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5R-D — income intelligence boundaries.
 *
 * Income is a derived read model over canonical ledger events plus (for
 * the portfolio view) one batched asset lookup. No writes, no scheduler,
 * no B3, no broker, no fiscal paths, no inferred classifications, no
 * yield, no forecast, no scores.
 */
describe('Phase 5R-D: income intelligence boundaries', () => {
  it('income engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource('packages/portfolio-strategy/src/income.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/setInterval|setTimeout|cron|schedule/i);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/fetch\(|axios/i);
    expect(content).not.toMatch(/process\.env/);
    expect(content).not.toMatch(/parseFloat|\bNumber\(/);
    expect(content).toContain('aggregateIncomeTotals');
    expect(content).toContain('bucketIncomeByMonth');
    expect(content).toContain('incomeShareBp');
    expect(content).toContain('rankIncomeRows');
    expect(content).toContain('INCOME_EVENT_TYPES');
  });

  it('income never infers anything and never converts currencies', () => {
    const files = [
      'packages/portfolio-strategy/src/income.ts',
      'apps/api/src/application/portfolios/get-portfolio-income.use-case.ts',
      'apps/api/src/application/performance/get-position-income.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-income.controller.ts',
      'apps/api/src/modules/performance/position-income.controller.ts',
      'apps/web/src/components/portfolio/PortfolioIncomeSection.tsx',
      'apps/web/src/components/portfolio/PositionIncomeSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioIncomeSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePositionIncomeSection.tsx',
    ];
    const heuristic =
      /startsWith|endsWith|toUpperCase\(\)|toLowerCase\(|currency\s*===?\s*['"]BRL['"]|exchange\s*===?\s*['"]B3['"]|ticker\s*===?\s*['"][A-Z]/;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(heuristic);
    }
    const portfolio = readSource(
      'apps/api/src/application/portfolios/get-portfolio-income.use-case.ts',
    );
    expect(portfolio).toMatch(/findByIds/);
    expect(portfolio).toContain('aggregateIncomeTotals');
  });

  it('income reads are derived only: no plan/goal/transaction writes', () => {
    for (const file of [
      'apps/api/src/application/portfolios/get-portfolio-income.use-case.ts',
      'apps/api/src/application/performance/get-position-income.use-case.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
      expect(content, file).not.toMatch(/transactions\.(create|createMany|update|delete)/);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration|@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
  });

  it('income APIs expose no mutation, scheduling or execution paths', () => {
    for (const file of [
      'apps/api/src/modules/portfolios/portfolio-income.controller.ts',
      'apps/api/src/modules/performance/position-income.controller.ts',
    ]) {
      const controller = readSource(file);
      expect(controller, file).toContain('CurrentPrincipal');
      expect(controller, file).toContain('UUIDParamPipe');
      expect(controller, file).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
    }
    const portfolioController = readSource(
      'apps/api/src/modules/portfolios/portfolio-income.controller.ts',
    );
    expect(portfolioController).toContain('api/v1/portfolios/:portfolioId/income-intelligence');
    const positionController = readSource(
      'apps/api/src/modules/performance/position-income.controller.ts',
    );
    expect(positionController).toContain(
      'api/v1/portfolios/:portfolioId/positions/:assetId/income',
    );
  });

  it('zero migrations: no new persistence for income', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(48);
    expect(migrations[migrations.length - 1]).toContain('add_transaction_rectifications');
  });

  it('no yield, forecast, score or advice language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/income.ts',
      'apps/api/src/application/portfolios/get-portfolio-income.use-case.ts',
      'apps/api/src/application/performance/get-position-income.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-income.controller.ts',
      'apps/api/src/modules/performance/position-income.controller.ts',
      'apps/web/src/components/portfolio/PortfolioIncomeSection.tsx',
      'apps/web/src/components/portfolio/PositionIncomeSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioIncomeSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePositionIncomeSection.tsx',
    ];
    const forbidden =
      /melhor pagadora|pior pagadora|renda ideal|renda recomendada|diversifique|dependência excessiva|compre|venda|yield esperado|previsão|expected return|sharpe|forecast|annualiz|forward yield|fair value|score|rating|buy now|sell now|recomendamos|ideal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, scheduler or fiscal language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/income.ts',
      'apps/api/src/application/portfolios/get-portfolio-income.use-case.ts',
      'apps/api/src/application/performance/get-position-income.use-case.ts',
      'apps/web/src/components/portfolio/PortfolioIncomeSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioIncomeSection.tsx',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|executar aporte|comprar agora|scheduler|cron|\bqueue\b|worker|fiscal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
