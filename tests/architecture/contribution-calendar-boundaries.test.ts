import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5Q-K — contribution planning calendar boundaries.
 *
 * The calendar is a read-only temporal view: it composes goal versions,
 * plans and CONFIRMED actuals per month. No plan/goal/link/transaction
 * writes, no scheduler, no automation, no B3, no broker paths.
 */
describe('Phase 5Q-K: contribution planning calendar boundaries', () => {
  it('calendar engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource('packages/portfolio-strategy/src/contribution-calendar.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/@atlas\/b3-integration/);
    expect(content).not.toMatch(/setInterval|setTimeout|cron|schedule/i);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/fetch\(|axios/i);
    expect(content).not.toMatch(/process\.env/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('deriveContributionPlanningCalendar');
    expect(content).toContain('validateCalendarRange');
    expect(content).toContain('MAX_CALENDAR_MONTHS');
  });

  it('calendar engine reuses goal semantics instead of recoding them', () => {
    const content = readSource('packages/portfolio-strategy/src/contribution-calendar.ts');
    expect(content).toContain('goalVersionForMonth');
    expect(content).toContain('enumerateGoalMonths');
    expect(content).toContain('addDecimals');
    expect(content).not.toMatch(/suggest|recommend|forecast|score|streak/i);
  });

  it('calendar read is derived only: no plan/goal/link/transaction writes', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-contribution-calendar.use-case.ts',
    );
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).not.toMatch(/links\.(confirm|reject|unlink|create)/);
    expect(content).not.toMatch(/transactions\.(create|createMany|update|delete)/);
    expect(content).not.toMatch(/plans\.(create|replace|remove|setStatus)/);
    expect(content).not.toMatch(/goals\.(replaceOpen|updateAmountIfOpen|endOpen|removeById)/);
    expect(content).not.toMatch(/CreateTransactionUseCase/);
    expect(content).not.toMatch(/@atlas\/b3-integration|@atlas\/tax-engine/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('listByPlanIds');
    expect(content).toContain('findByIds');
    expect(content).toContain('deriveContributionPlanningCalendar');
  });

  it('calendar API exposes no mutation, scheduling or execution paths', () => {
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-contribution-calendar.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('contribution-calendar');
    expect(controller).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
  });

  it('calendar query accepts only an explicit bounded month window', () => {
    const dto = readSource(
      'apps/api/src/modules/portfolios/dto/portfolio-contribution-calendar.dto.ts',
    );
    expect(dto).toContain('ContributionCalendarQuerySchema');
    const bodyBlock = dto.slice(dto.indexOf('ContributionCalendarQuerySchema'));
    expect(bodyBlock).not.toMatch(
      /currency|portfolioId|status|planned|actual|recommend|limit|offset/,
    );
  });

  it('zero migrations: no new persistence for the calendar', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(42);
    expect(migrations[migrations.length - 1]).toContain('add_reconciliation_decisions');
  });

  it('no suggestion, reminder, forecast, score or automation in the calendar stack', () => {
    const files = [
      'packages/portfolio-strategy/src/contribution-calendar.ts',
      'apps/api/src/application/portfolios/portfolio-contribution-calendar.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-contribution-calendar.controller.ts',
      'apps/web/src/components/portfolio/PortfolioContributionCalendar.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /você deveria|deve (investir|aportar|aumentar)|recomendamos|ideal|ótimo|melhor valor|invista|lembrete|atrasado|meta perdida|previsão|mantendo (a|este)|projeção|streak|sequência|score|meta batida|parabéns|auto-|recorrência|ganhar|perder|winner|bestGoal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, scheduler or fiscal language in the calendar stack', () => {
    const files = [
      'packages/portfolio-strategy/src/contribution-calendar.ts',
      'apps/api/src/application/portfolios/portfolio-contribution-calendar.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-contribution-calendar.controller.ts',
      'apps/web/src/components/portfolio/PortfolioContributionCalendar.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /b3|corretora|broker|enviar ordem|executar aporte|comprar agora|scheduler|cron|\bqueue\b|worker|fiscal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
