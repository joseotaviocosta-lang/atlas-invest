import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5R-A — position intelligence boundaries.
 *
 * The endpoint is a read-only composition of canonical sources. No
 * transaction, plan, goal, link, strategy or scheduler writes; no B3,
 * broker, fiscal or forecast paths; no scores, ratings or advice.
 */
describe('Phase 5R-A: position intelligence boundaries', () => {
  it('composition helpers stay pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-position-intelligence.compose.ts',
    );
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/fetch\(|axios/i);
    expect(content).not.toMatch(/process\.env/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('aggregatePositionIncome');
    expect(content).toContain('derivePositionActivity');
    expect(content).toContain('POSITION_RECENT_ACTIVITY_LIMIT');
  });

  it('intelligence read is derived only: no plan/goal/link/transaction writes', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-position-intelligence.use-case.ts',
    );
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).not.toMatch(/links\.(confirm|reject|unlink|create)/);
    expect(content).not.toMatch(/transactions\.(create|createMany|update|delete)/);
    expect(content).not.toMatch(/plans\.(create|replace|remove|setStatus)/);
    expect(content).not.toMatch(/goals\.(replaceOpen|updateAmountIfOpen|endOpen|removeById)/);
    expect(content).not.toMatch(/CreateTransactionUseCase/);
    expect(content).not.toMatch(/@atlas\/b3-integration|@atlas\/tax-engine/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('GetPortfolioValuationUseCase');
    expect(content).toContain('GetPortfolioAllocationUseCase');
    expect(content).toContain('findByPortfolioId');
  });

  it('intelligence API exposes no mutation, scheduling or execution paths', () => {
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-position-intelligence.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('positions/:assetId/intelligence');
    expect(controller).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
  });

  it('position responses expose no provider, external or fingerprint identifiers', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-position-intelligence.use-case.ts',
    );
    expect(content).not.toMatch(/externalId|fingerprint|providerSymbol/);
  });

  it('zero migrations: no new persistence for position intelligence', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(41);
    expect(migrations[migrations.length - 1]).toContain('contribution_goals');
  });

  it('no recommendation, rating, score, forecast or automation in the stack', () => {
    const files = [
      'apps/api/src/application/portfolios/portfolio-position-intelligence.compose.ts',
      'apps/api/src/application/portfolios/portfolio-position-intelligence.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-position-intelligence.controller.ts',
      'apps/web/src/components/portfolio/PositionIntelligenceSection.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /você deveria|deve (investir|aportar|comprar|vender)|recomendamos|ideal|ótimo|melhor valor|invista|score|rating|streak|meta batida|parabéns|forecast|previsão|mantendo (a|este)|projeção|targetPrice|fair value|good investment|bad investment|attractive|cheap|expensive|buy now|sell now|hold\b|winner|bestAsset|auto-|recorrência|ganhar|perder/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, scheduler or fiscal language in the stack', () => {
    const files = [
      'apps/api/src/application/portfolios/portfolio-position-intelligence.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-position-intelligence.controller.ts',
      'apps/web/src/components/portfolio/PositionIntelligenceSection.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|executar aporte|comprar agora|scheduler|cron|\bqueue\b|worker|fiscal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
