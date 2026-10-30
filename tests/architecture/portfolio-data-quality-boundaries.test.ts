import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5R-E — data quality boundaries.
 *
 * Quality is a derived diagnostic read model over canonical valuation,
 * allocation and integration-run reads plus batched asset metadata. No
 * writes, no scheduler, no B3, no broker, no fiscal paths, no inferred
 * classifications, no scores, no repairs.
 */
describe('Phase 5R-E: data quality boundaries', () => {
  it('quality engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource('packages/portfolio-strategy/src/data-quality.ts');
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
    expect(content).toContain('isDataQualityIssue');
    expect(content).toContain('deriveQualityStatus');
    expect(content).toContain('sortQualityIssues');
    expect(content).not.toMatch(/score/i);
  });

  it('quality never infers classifications from names, tickers or currencies', () => {
    const files = [
      'packages/portfolio-strategy/src/data-quality.ts',
      'apps/api/src/application/portfolios/portfolio-data-quality.compose.ts',
      'apps/api/src/application/portfolios/get-portfolio-data-quality.use-case.ts',
      'apps/api/src/application/performance/get-position-data-quality.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-data-quality.controller.ts',
      'apps/api/src/modules/performance/position-data-quality.controller.ts',
      'apps/web/src/components/portfolio/PortfolioDataQualitySection.tsx',
      'apps/web/src/components/portfolio/PositionDataQualitySection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioDataQualitySection.tsx',
      'apps/mobile/src/components/portfolio/MobilePositionDataQualitySection.tsx',
    ];
    const heuristic =
      /startsWith|endsWith|toUpperCase\(\)|toLowerCase\(|currency\s*===?\s*['"]BRL['"]|exchange\s*===?\s*['"]B3['"]|ticker\s*===?\s*['"][A-Z]/;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(heuristic);
    }
  });

  it('quality reads are derived only: no ledger/quote/import writes, no per-position replays', () => {
    for (const file of [
      'apps/api/src/application/portfolios/portfolio-data-quality.compose.ts',
      'apps/api/src/application/portfolios/get-portfolio-data-quality.use-case.ts',
      'apps/api/src/application/performance/get-position-data-quality.use-case.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
      expect(content, file).not.toMatch(/transactions\.(create|createMany|update|delete)/);
      expect(content, file).not.toMatch(/recordConfirmation|recordPreview|recordFailure/);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
    const composer = readSource(
      'apps/api/src/application/portfolios/portfolio-data-quality.compose.ts',
    );
    expect(composer).toContain('GetPortfolioValuationUseCase');
    expect(composer).toContain('GetPortfolioAllocationUseCase');
    expect(composer).toContain('listRecentByPortfolioIds');
    expect(composer).toContain('findByIds');
    expect(composer).not.toMatch(/replayPortfolio|replayPortfolioTimeline/);
    const position = readSource(
      'apps/api/src/application/performance/get-position-data-quality.use-case.ts',
    );
    expect(position).toContain('composePortfolioDataQuality');
    expect(position).not.toMatch(/replayPortfolio/);
  });

  it('quality APIs expose no mutation, scheduling or execution paths', () => {
    for (const file of [
      'apps/api/src/modules/portfolios/portfolio-data-quality.controller.ts',
      'apps/api/src/modules/performance/position-data-quality.controller.ts',
    ]) {
      const controller = readSource(file);
      expect(controller, file).toContain('CurrentPrincipal');
      expect(controller, file).toContain('UUIDParamPipe');
      expect(controller, file).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
    }
    expect(
      readSource('apps/api/src/modules/portfolios/portfolio-data-quality.controller.ts'),
    ).toContain('api/v1/portfolios/:portfolioId/data-quality');
    expect(
      readSource('apps/api/src/modules/performance/position-data-quality.controller.ts'),
    ).toContain('api/v1/portfolios/:portfolioId/positions/:assetId/data-quality');
  });

  it('zero migrations: no new persistence for quality', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(48);
    expect(migrations[migrations.length - 1]).toContain('add_transaction_rectifications');
  });

  it('no score, rating, risk, recommendation or forecast language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/data-quality.ts',
      'apps/api/src/application/portfolios/portfolio-data-quality.compose.ts',
      'apps/api/src/application/portfolios/get-portfolio-data-quality.use-case.ts',
      'apps/api/src/application/performance/get-position-data-quality.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-data-quality.controller.ts',
      'apps/api/src/modules/performance/position-data-quality.controller.ts',
      'apps/web/src/components/portfolio/PortfolioDataQualitySection.tsx',
      'apps/web/src/components/portfolio/PositionDataQualitySection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioDataQualitySection.tsx',
      'apps/mobile/src/components/portfolio/MobilePositionDataQualitySection.tsx',
    ];
    const forbidden =
      /boa carteira|má carteira|segura|arriscada|melhor|pior|recomendamos|deveria investir|venda|compre|score|rating|health|saudável|forecast|previsão|expected return|sharpe|buy now|sell now|ideal|ótimo/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, scheduler, fiscal or auto-repair language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/data-quality.ts',
      'apps/api/src/application/portfolios/portfolio-data-quality.compose.ts',
      'apps/web/src/components/portfolio/PortfolioDataQualitySection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioDataQualitySection.tsx',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|executar aporte|comprar agora|auto[-\s]?correct|auto[-\s]?repair|aceitar automaticamente|scheduler|cron|\bqueue\b|worker|fiscal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
