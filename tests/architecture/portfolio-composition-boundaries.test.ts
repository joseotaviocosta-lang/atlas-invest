import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5R-C — portfolio composition boundaries.
 *
 * Composition is a read-only view over the canonical allocation read
 * model plus a batched asset lookup. No writes, no scheduler, no B3,
 * no broker, no fiscal paths, no inferred classifications, no scores.
 */
describe('Phase 5R-C: portfolio composition boundaries', () => {
  it('composition engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource('packages/portfolio-strategy/src/composition.ts');
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
    expect(content).toContain('buildCompositionDimension');
    expect(content).toContain('topPositions');
    expect(content).toContain('largestBucket');
    expect(content).toContain('UNCLASSIFIED_KEY');
  });

  it('composition never infers classifications from names, tickers or currencies', () => {
    const files = [
      'packages/portfolio-strategy/src/composition.ts',
      'apps/api/src/application/portfolios/get-portfolio-composition.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-composition.controller.ts',
      'apps/web/src/components/portfolio/PortfolioCompositionSection.tsx',
      'apps/mobile/src/components/portfolio/MobileCompositionSection.tsx',
    ];
    const heuristic =
      /startsWith|endsWith|\.includes\(|toUpperCase\(\)|toLowerCase\(|currency\s*===?\s*['"]BRL['"]|exchange\s*===?\s*['"]B3['"]|ticker\s*===?\s*['"][A-Z]/;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(heuristic);
    }
    const usecase = readSource(
      'apps/api/src/application/portfolios/get-portfolio-composition.use-case.ts',
    );
    // Categories come from canonical allocation fields only.
    expect(usecase).toMatch(/assetType|nativeCurrency|exchange/);
  });

  it('composition read is derived only: no plan/goal/transaction writes', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/get-portfolio-composition.use-case.ts',
    );
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).not.toMatch(/transactions\.(create|createMany|update|delete)/);
    expect(content).not.toMatch(/CreateTransactionUseCase/);
    expect(content).not.toMatch(/@atlas\/b3-integration|@atlas\/tax-engine/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('GetPortfolioAllocationUseCase');
    expect(content).toContain('findByIds');
    expect(content).toContain('buildCompositionDimension');
  });

  it('composition API exposes no mutation, scheduling or execution paths', () => {
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-composition.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('api/v1/portfolios/:portfolioId/composition');
    expect(controller).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
  });

  it('zero migrations: no new persistence for composition', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(48);
    expect(migrations[migrations.length - 1]).toContain('add_transaction_rectifications');
  });

  it('no score, ranking, advice or forecast language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/composition.ts',
      'apps/api/src/application/portfolios/get-portfolio-composition.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-composition.controller.ts',
      'apps/web/src/components/portfolio/PortfolioCompositionSection.tsx',
      'apps/mobile/src/components/portfolio/MobileCompositionSection.tsx',
    ];
    const forbidden =
      /diversificada|concentrad[ao]|arriscad[ao]|baixo risco|alto risco|ideal|recomendamos|rebalancear|score|rating|top performer|melhor ativo|pior ativo|buy now|sell now|forecast|previsão|expected return|sharpe/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, scheduler or fiscal language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/composition.ts',
      'apps/api/src/application/portfolios/get-portfolio-composition.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-composition.controller.ts',
      'apps/web/src/components/portfolio/PortfolioCompositionSection.tsx',
      'apps/mobile/src/components/portfolio/MobileCompositionSection.tsx',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|executar aporte|comprar agora|scheduler|cron|\bqueue\b|worker|fiscal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
