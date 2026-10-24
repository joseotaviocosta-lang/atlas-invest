import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5Q-C — allocation strategy architecture boundaries.
 *
 * User intent is persisted (one table, no secrets, no financial payloads);
 * comparison stays derived and read-only. No ledger writes, no B3
 * transport, no scheduler internals, no fiscal engine in the path.
 * No trade/order/rebalance vocabulary anywhere.
 */
describe('Phase 5Q-C: allocation strategy architecture boundaries', () => {
  it('strategy engine is pure: no Nest/Prisma/database/UI/network/clock', () => {
    for (const file of [
      'packages/portfolio-strategy/src/types.ts',
      'packages/portfolio-strategy/src/policy.ts',
      'packages/portfolio-strategy/src/strategy.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@nestjs/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/setInterval|setTimeout/);
      expect(content, file).not.toMatch(/Date\.now\(\)/);
      expect(content, file).not.toMatch(/new Date\(\s*\)/);
      expect(content, file).not.toMatch(/fetch\(|axios/i);
      expect(content, file).not.toMatch(/process\.env/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
  });

  it('strategy use-case and controller never touch ledger writers, live B3 or fiscal engines', () => {
    for (const file of [
      'apps/api/src/application/portfolios/get-portfolio-allocation-strategy.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-allocation-strategy.controller.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/executeMany/);
      expect(content, file).not.toMatch(/transactionRepository\.create/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/parseFloat/);
    }
  });

  it('strategy persistence holds no secrets, tokens or financial payloads', () => {
    const schema = readSource('packages/database/prisma/schema.prisma');
    const model = schema.slice(schema.indexOf('model PortfolioAllocationStrategyTarget'));
    const block = model.slice(0, model.indexOf('\n}'));
    const columns = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    for (const line of columns) {
      expect(line).not.toMatch(/token|secret|private|cert|password|cpf|payload|amount|quantity/i);
    }
    expect(block).toContain('targetBp');
  });

  it('strategy API stays ownership-guarded with strict input', () => {
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-allocation-strategy.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('ZodValidationPipe');
    const dto = readSource(
      'apps/api/src/modules/portfolios/dto/portfolio-allocation-strategy.dto.ts',
    );
    expect(dto).toContain('.strict()');
  });

  it('no trade, order or rebalance vocabulary enters the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/types.ts',
      'packages/portfolio-strategy/src/policy.ts',
      'packages/portfolio-strategy/src/strategy.ts',
      'apps/api/src/application/portfolios/get-portfolio-allocation-strategy.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-allocation-strategy.controller.ts',
      'apps/web/src/components/portfolio/PortfolioStrategySection.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
      'packages/ui/src/view-models/portfolio-review.view-model.ts',
    ];
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/rebalance|rebalancear|auto-?reba/i);
      expect(content, file).not.toMatch(/Gerar ordens|gerar ordem/i);
      expect(content, file).not.toMatch(/Comprar|Vender\b/);
      expect(content, file).not.toMatch(/ordem de (compra|venda|corretora)/i);
    }
  });

  it('web and mobile strategy surfaces never import schedulers, DB repos or B3 transport', () => {
    for (const file of [
      'apps/web/src/components/portfolio/PortfolioStrategySection.tsx',
      'apps/web/src/app/(app)/portfolio/page.tsx',
      'apps/web/src/app/(app)/today/page.tsx',
      'apps/mobile/src/components/portfolio/MobileStrategySection.tsx',
      'apps/mobile/app/(app)/portfolio/review-detail.tsx',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@atlas\/b3-integration|@atlas\/import-engine/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/SimulatedB3|B3Http/);
    }
  });
});
