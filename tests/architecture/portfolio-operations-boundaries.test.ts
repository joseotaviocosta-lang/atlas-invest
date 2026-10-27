import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5S-A — operations center boundaries.
 *
 * The center is a derived aggregator over integration settings, recent
 * runs, review derivation and 5R-E data quality. No writes, no scheduler,
 * no B3, no broker, no fiscal paths, no second source of truth, no
 * scores, no repairs.
 */
describe('Phase 5S-A: operations center boundaries', () => {
  it('operations engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource('packages/portfolio-strategy/src/operations.ts');
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
    expect(content).toContain('buildOperationsAttention');
    expect(content).toContain('deriveOperationsStatus');
    expect(content).toContain('previewAttention');
    expect(content).not.toMatch(/score/i);
  });

  it('operations never infers classifications from names, tickers or currencies', () => {
    const files = [
      'packages/portfolio-strategy/src/operations.ts',
      'apps/api/src/application/portfolios/portfolio-operations.compose.ts',
      'apps/api/src/application/portfolios/get-portfolio-operations.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-operations.controller.ts',
      'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioOperationsSection.tsx',
    ];
    const heuristic =
      /startsWith|endsWith|toUpperCase\(\)|toLowerCase\(|currency\s*===?\s*['"]BRL['"]|exchange\s*===?\s*['"]B3['"]|ticker\s*===?\s*['"][A-Z]/;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(heuristic);
    }
  });

  it('operations reads are derived only: no run/connection/transaction writes, no replays', () => {
    for (const file of [
      'apps/api/src/application/portfolios/portfolio-operations.compose.ts',
      'apps/api/src/application/portfolios/get-portfolio-operations.use-case.ts',
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
      'apps/api/src/application/portfolios/portfolio-operations.compose.ts',
    );
    expect(composer).toContain('IntegrationSettingsService');
    expect(composer).toContain('composePortfolioDataQuality');
    expect(composer).toContain('listRecentByPortfolioIds');
    expect(composer).toContain('deriveReviewItems');
    expect(composer).not.toMatch(/replayPortfolio|replayPortfolioTimeline/);
    expect(composer).not.toMatch(/executeNext|claimDue|ensure\(/);
  });

  it('operations API exposes no mutation, scheduling or execution paths', () => {
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-operations.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('api/v1/portfolios/:portfolioId/operations-center');
    expect(controller).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
  });

  it('zero migrations: no new persistence for operations', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(42);
    expect(migrations[migrations.length - 1]).toContain('add_reconciliation_decisions');
  });

  it('no score, rating, risk, recommendation, investment or forecast language', () => {
    const files = [
      'packages/portfolio-strategy/src/operations.ts',
      'apps/api/src/application/portfolios/portfolio-operations.compose.ts',
      'apps/api/src/application/portfolios/get-portfolio-operations.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-operations.controller.ts',
      'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioOperationsSection.tsx',
    ];
    const forbidden =
      /boa carteira|má carteira|segura|arriscada|melhor|pior|recomendamos|deveria investir|venda|compre|score|rating|health|saudável|forecast|previsão|expected return|sharpe|buy now|sell now|ideal|ótimo|investimento ruim|risco alto/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, retry, scheduler-mutation, fiscal or secret language', () => {
    const files = [
      'packages/portfolio-strategy/src/operations.ts',
      'apps/api/src/application/portfolios/portfolio-operations.compose.ts',
      'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx',
      'apps/mobile/src/components/portfolio/MobilePortfolioOperationsSection.tsx',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|executar aporte|comprar agora|sincronizar agora|tentar novamente|auto[-\s]?correct|auto[-\s]?repair|aceitar divergência|scheduler|cron|\bqueue\b|worker|fiscal|secret|certificate|password|clientSecret|fingerprint/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
