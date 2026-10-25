import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5Q-E — saved scenarios & comparison boundaries.
 *
 * Persistence holds inputs only (verified structurally); the comparison
 * engine stays pure; the API simulates both sides on one shared basis;
 * surfaces render server numbers without choosing, scoring or executing.
 */
describe('Phase 5Q-E/5Q-F: saved scenarios and contribution plans boundaries', () => {
  it('comparison engine stays pure with no persistence or clock', () => {
    const content = readSource('packages/portfolio-strategy/src/scenario.ts');
    expect(content).toContain('compareScenarioResults');
    expect(content).toContain('compareScenarioResults');
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/parseFloat/);
    // Structural same-basis enforcement lives here, not in callers.
    expect(content).toContain('Cannot compare scenarios across currencies');
    expect(content).toContain('different portfolio states');
  });

  it('saved-scenario API persists inputs only and never orders or executes', () => {
    for (const file of [
      'apps/api/src/application/portfolios/portfolio-allocation-scenarios.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-allocation-scenarios.controller.ts',
      'packages/database/src/repositories/allocation-scenario.repository.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/transactionRepository\.create/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
    // Persistence holds inputs only: no projected/result columns or mappings.
    // (Live results legitimately carry projected weights — they are computed,
    // never stored — so this guard targets the repository + migration only.)
    for (const file of [
      'packages/database/src/repositories/allocation-scenario.repository.ts',
      'packages/database/prisma/migrations/20261024170000_add_portfolio_allocation_scenarios/migration.sql',
    ]) {
      const content = readSource(file)
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      expect(content, file).not.toMatch(/projected|deviation|score|recommend|coverage|valuation/i);
    }
    const dto = readSource(
      'apps/api/src/modules/portfolios/dto/portfolio-allocation-scenarios.dto.ts',
    );
    expect(dto).toContain('SaveAllocationScenarioBodySchema');
    expect(dto).toContain('CompareAllocationScenariosBodySchema');
    expect(dto).toContain('.strict()');
    const saveBlock = dto.slice(dto.indexOf('SaveAllocationScenarioBodySchema'));
    expect(saveBlock).not.toMatch(/currentValue|projectedValue|targetBp/);
    expect(saveBlock).not.toMatch(/portfolioId/);
    expect(saveBlock).not.toMatch(/provider|source|currency/);
    // Comparison takes exactly two distinct scenario ids.
    expect(dto).toContain('scenarioIds');
    expect(dto).toContain('tuple');
  });

  it('saved-scenario use-case reuses the engine and shares one basis for compare', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-allocation-scenarios.use-case.ts',
    );
    expect(content).toContain('validateScenarioInput');
    expect(content).toContain('validateScenarioName');
    expect(content).toContain('parseScenarioAmountToCanonical');
    expect(content).toContain('compareScenarioResults');
    expect(content).toContain('simulateMany');
    expect(content).toContain('MAX_SAVED_SCENARIOS_PER_PORTFOLIO');
    // No second validation or deviation implementation.
    expect(content).not.toMatch(/CANONICAL_AMOUNT|UNKNOWN_SCENARIO_TYPE/);
  });

  it('web saved-scenarios surface renders server numbers without advising', () => {
    const section = readSource('apps/web/src/components/portfolio/PortfolioSavedScenarios.tsx');
    expect(section).not.toMatch(/projectedBp\s*=/);
    expect(section).not.toMatch(/parseFloat/);
    expect(section).toContain('/allocation-scenarios/compare');
    expect(section).toContain('/allocation-scenarios');
    expect(section).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem/);
  });

  it('no winner, ranking, score or advice vocabulary enters the 5Q stack', () => {
    const files = [
      'packages/portfolio-strategy/src/scenario.ts',
      'packages/portfolio-strategy/src/contribution-plan.ts',
      'packages/database/src/repositories/allocation-scenario.repository.ts',
      'packages/database/src/repositories/contribution-plan.repository.ts',
      'apps/api/src/application/portfolios/portfolio-allocation-scenarios.use-case.ts',
      'apps/api/src/application/portfolios/portfolio-contribution-plans.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-allocation-scenarios.controller.ts',
      'apps/api/src/modules/portfolios/portfolio-contribution-plans.controller.ts',
      'apps/web/src/components/portfolio/PortfolioSavedScenarios.tsx',
      'apps/web/src/components/portfolio/PortfolioContributionPlans.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /você deveria|deve (comprar|vender|aportar)|recomendamos|melhor cenário|ideal|ótimo|rebalancear agora|executar|ordem de (compra|venda)|compre|venda|winner|bestScenario|health score|optimization score|nota \d/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/Markowitz|risk parity|optimizer|solver/i);
    }
  });

  it('contribution plan engine stays pure: no Nest/Prisma/clock/floats', () => {
    for (const file of [
      'packages/portfolio-strategy/src/contribution-tracking.ts',
      'packages/portfolio-strategy/src/contribution-plan.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@nestjs/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/setInterval|setTimeout/);
      expect(content, file).not.toMatch(/Date\.now\(\)/);
      expect(content, file).not.toMatch(/new Date\(\s*\)/);
      expect(content, file).not.toMatch(/fetch\(|axios/i);
      expect(content, file).not.toMatch(/process\.env/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
  });

  it('candidate derivation can never persist CONFIRMED without explicit action', () => {
    const content = readSource(
      'apps/api/src/application/portfolios/portfolio-contribution-plans.use-case.ts',
    );
    // getPlanTracking derives candidates; only confirmPlanLink persists them.
    const trackingBody = content.slice(
      content.indexOf('async getPlanTracking'),
      content.indexOf('async confirmPlanLink'),
    );
    expect(trackingBody).not.toMatch(/links\.confirm/);
    expect(trackingBody).toContain('deriveContributionCandidates');
    expect(readSource('packages/portfolio-strategy/src/contribution-tracking.ts')).toContain(
      'MAX_TRACKING_CANDIDATES',
    );
  });

  it('contribution plans never touch transactions, ledgers or execution', () => {
    for (const file of [
      'packages/database/src/repositories/contribution-plan.repository.ts',
      'packages/database/src/repositories/contribution-plan-link.repository.ts',
      'apps/api/src/application/portfolios/portfolio-contribution-plans.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-contribution-plans.controller.ts',
      'apps/web/src/components/portfolio/PortfolioContributionPlans.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ]) {
      const content = readSource(file);
      // Reads use interfaces + finders; writes/mutations are prohibited.
      // (Interface names contain 'TransactionRepository' — match the concrete writer only.)
      expect(content, file).not.toMatch(/[^I]TransactionRepository/);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/transactions\.(create|createMany|update)/);
      expect(content, file).not.toMatch(/prisma\.transaction\.(create|createMany|update|delete)/);
      expect(content, file).not.toMatch(/new TransactionRepository/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
    const migration = readSource(
      'packages/database/prisma/migrations/20261024173000_add_portfolio_contribution_plans/migration.sql',
    )
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(migration).not.toMatch(/transaction|ledger|broker|order/i);
  });

  it('plan persistence holds intent only: no result or execution columns', () => {
    for (const file of [
      'packages/database/src/repositories/contribution-plan.repository.ts',
      'packages/database/prisma/migrations/20261024173000_add_portfolio_contribution_plans/migration.sql',
    ]) {
      const content = readSource(file)
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      expect(content, file).not.toMatch(/projected|deviation|score|recommend|coverage|valuation/i);
    }
    const dto = readSource(
      'apps/api/src/modules/portfolios/dto/portfolio-contribution-plans.dto.ts',
    );
    expect(dto).toContain('.strict()');
    // Create/update bodies hold intent only; transactionId lives solely in
    // the link body (explicit human confirmation target).
    const createBlock = dto.slice(
      dto.indexOf('CreateContributionPlanBodySchema'),
      dto.indexOf('UpdateContributionPlanBodySchema'),
    );
    expect(createBlock).not.toMatch(/status|currency|completedAt|transaction/i);
    // sourceScenarioId is the only allowed source reference (provenance).
    expect(createBlock).not.toMatch(/portfolioId|provider|source(?!ScenarioId)/);
    expect(dto).toContain('transactionId');
  });
});
