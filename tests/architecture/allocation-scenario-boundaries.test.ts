import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5Q-D — scenario simulation boundaries (hypothetical-only).
 *
 * Engine stays pure (no DB/ledger/B3/fiscal/UI); the API stays
 * read/compute-only (no persistence, no orders); the web surface
 * renders server numbers without computing weights or advising.
 */
describe('Phase 5Q-D: scenario simulation boundaries', () => {
  it('scenario engine is pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    for (const file of ['packages/portfolio-strategy/src/scenario.ts']) {
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
      // NOTE: Number() is allowed only for BigInt->integer-bp conversion;
      // money itself never touches floats (BigInt decimal strings).
    }
  });

  it('scenario API never persists, orders, or touches live B3/fiscal/ledger', () => {
    // NOTE: get-portfolio-allocation-strategy.use-case.ts also hosts the 5Q-C
    // replace/clear methods in the same file by design; the scenario path
    // itself (simulateScenario) writes nothing — covered by the API
    // persistence test. Here we guard the file against ledger/B3/fiscal.
    for (const file of [
      'apps/api/src/application/portfolios/get-portfolio-allocation-strategy.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-allocation-strategy.controller.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/transactionRepository\.create/);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
    const dto = readSource(
      'apps/api/src/modules/portfolios/dto/portfolio-allocation-strategy.dto.ts',
    );
    expect(dto).toContain('SimulateAllocationScenarioBodySchema');
    expect(dto).toContain('.strict()');
    // Server-authority: only type + changes accepted; no current/projected/targets/currency.
    expect(dto).toContain("z.literal('CONTRIBUTION')");
    const simulateBlock = dto.slice(dto.indexOf('SimulateAllocationScenarioBodySchema'));
    expect(simulateBlock).not.toMatch(/currentValue|projectedValue/);
    expect(simulateBlock).not.toMatch(/portfolioId/);
    expect(simulateBlock).not.toMatch(/provider|source/);
  });

  it('web simulator renders server numbers without computing weights or advising', () => {
    const simulator = readSource(
      'apps/web/src/components/portfolio/PortfolioScenarioSimulator.tsx',
    );
    expect(simulator).not.toMatch(/projectedBp\s*=/);
    expect(simulator).not.toMatch(/parseFloat/);
    expect(simulator).toContain('/allocation-strategy/simulate');
    expect(simulator).toContain('Simular');
    expect(simulator).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem/);
  });

  it('no advice, optimization or execution vocabulary enters the 5Q-D stack', () => {
    const files = [
      'packages/portfolio-strategy/src/scenario.ts',
      'packages/ui/src/view-models/allocation-scenario.view-model.ts',
      'apps/api/src/application/portfolios/get-portfolio-allocation-strategy.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-allocation-strategy.controller.ts',
      'apps/web/src/components/portfolio/PortfolioScenarioSimulator.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
    ];
    const forbidden =
      /você deveria|deve (comprar|vender|aportar)|recomendamos|melhor cenário|ideal|ótimo|rebalancear agora|executar|ordem de (compra|venda)|compre|venda|health score|optimization score|nota \d/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
    // 'Otimização' style words never appear either.
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/Markowitz|risk parity|optimizer|solver/i);
    }
  });
});
