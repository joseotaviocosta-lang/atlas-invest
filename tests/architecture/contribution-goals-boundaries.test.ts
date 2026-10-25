import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5Q-J — user-defined contribution goals boundaries.
 *
 * The goal is user-declared intent (amount + effective month). The Atlas
 * only compares plans and confirmed actuals against it: no suggested
 * amounts, no recommendation engine, no scheduler, no transactions,
 * no scores, no streaks, no gamification, no forecasts, no B3 paths.
 */
describe('Phase 5Q-J: contribution goals boundaries', () => {
  it('goal engine stays pure: no Nest/Prisma/clock/floats/scheduler', () => {
    const content = readSource('packages/portfolio-strategy/src/contribution-goals.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/@atlas\/b3-integration/);
    expect(content).not.toMatch(/@atlas\/tax-engine/);
    expect(content).not.toMatch(/setInterval|setTimeout|cron|schedule/);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/fetch\(|axios/i);
    expect(content).not.toMatch(/process\.env/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('goalForMonth');
    expect(content).toContain('deriveGoalProgress');
    expect(content).toContain('enumerateGoalMonths');
  });

  it('goal repository writes versions only: no ledger, transaction or B3 paths', () => {
    const content = readSource(
      'packages/database/src/repositories/contribution-goal.repository.ts',
    );
    expect(content).not.toMatch(/\.transaction\.|TransactionRepository|createTransaction/);
    expect(content).not.toMatch(/ledger/i);
    expect(content).not.toMatch(/@atlas\/b3-integration|broker/i);
    expect(content).toContain('replaceOpen');
    expect(content).toContain('effectiveTo');
  });

  it('goal use-case never suggests, schedules, executes or writes the ledger', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-contribution-goals.use-case.ts',
    );
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
    expect(content).not.toMatch(/transactions\.(create|createMany|update|delete)/);
    expect(content).not.toMatch(/CreateTransactionUseCase/);
    expect(content).not.toMatch(
      /@nestjs\/schedule|node-cron|setInterval|setTimeout|bullmq|agenda/i,
    );
    expect(content).not.toMatch(/@atlas\/b3-integration|@atlas\/tax-engine/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).not.toMatch(
      /suggestedAmount|recommendedAmount|idealAmount|defaultGoal|autoGoal|computeRecommended|\.suggest\(|\.recommend\(/i,
    );
    expect(content).toContain('resolveGoalCurrency');
    expect(content).toContain('validateGoalMonth');
  });

  it('goal API accepts only amount + effective month and owns currency server-side', () => {
    const dto = readSource(
      'apps/api/src/modules/portfolios/dto/portfolio-contribution-goals.dto.ts',
    );
    expect(dto).toContain('PutContributionGoalBodySchema');
    const bodyBlock = dto.slice(dto.indexOf('PutContributionGoalBodySchema'));
    expect(bodyBlock).not.toMatch(/currency|portfolioId|status|planned|actual|recommend/i);
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-contribution-goals.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('contribution-goal');
    expect(controller).not.toMatch(/Post\(/);
  });

  it('migration is additive with a single open version per portfolio', () => {
    const migration = readSource(
      'packages/database/prisma/migrations/20261025120000_add_portfolio_contribution_goals/migration.sql',
    );
    expect(migration).toContain('portfolio_contribution_goals');
    expect(migration).toContain('open_version_unique');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).toContain('amount_positive');
  });

  it('no suggestion, recommendation, score, streak, gamification or forecast in the goal stack', () => {
    const files = [
      'packages/portfolio-strategy/src/contribution-goals.ts',
      'packages/database/src/repositories/contribution-goal.repository.ts',
      'apps/api/src/application/portfolios/portfolio-contribution-goals.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-contribution-goals.controller.ts',
      'apps/api/src/modules/portfolios/dto/portfolio-contribution-goals.dto.ts',
      'apps/web/src/components/portfolio/PortfolioContributionGoal.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /você deveria|deve (investir|aportar|aumentar)|recomendamos|ideal|ótimo|melhor valor|invista|disciplina|streak|sequência|score|meta batida|parabéns|forecast|previsão|mantendo (a|este)|projeção de|ganhar|perder|winner|bestGoal|health score|auto-invest|autoInvest|recorrência automática/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order or execution language in the goal stack', () => {
    const files = [
      'packages/portfolio-strategy/src/contribution-goals.ts',
      'packages/database/src/repositories/contribution-goal.repository.ts',
      'apps/api/src/application/portfolios/portfolio-contribution-goals.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-contribution-goals.controller.ts',
      'apps/web/src/components/portfolio/PortfolioContributionGoal.tsx',
      'apps/web/src/components/portfolio/PortfolioContributionInsights.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /b3|correta?a?gem|broker|enviar ordem|executar aporte|comprar agora|auto-confirm|autoConfirm/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
