import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5R-B — position performance boundaries.
 *
 * Performance is a read-only derivation: the shared TWR engine plus
 * canonical replay facts. No transaction/strategy writes, no scheduler,
 * no B3, no broker, no fiscal paths, no simplified-return heuristics,
 * no current-weight approximations.
 */
describe('Phase 5R-B: position performance boundaries', () => {
  it('attribution engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    for (const file of [
      'packages/performance-engine/src/position-attribution.ts',
      'packages/performance-engine/src/position-performance.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@nestjs/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/setInterval|setTimeout|cron|schedule/i);
      expect(content, file).not.toMatch(/Date\.now\(\)/);
      expect(content, file).not.toMatch(/new Date\(\s*\)/);
      expect(content, file).not.toMatch(/fetch\(|axios/i);
      expect(content, file).not.toMatch(/process\.env/);
      expect(content, file).not.toMatch(/parseFloat|Number\(/);
    }
    const attribution = readSource('packages/performance-engine/src/position-attribution.ts');
    expect(attribution).toContain('attributePositionContributions');
    expect(attribution).toContain('sumPositionRealized');
    const flows = readSource('packages/performance-engine/src/position-performance.ts');
    expect(flows).toContain('toPositionCapitalFlow');
    expect(flows).toContain('calculatePositionTwr');
  });

  it('rejects shortcut formulas: no naive return or current-weight attribution', () => {
    const files = [
      'packages/performance-engine/src/position-attribution.ts',
      'packages/performance-engine/src/position-performance.ts',
      'apps/api/src/application/performance/get-position-performance.use-case.ts',
      'apps/api/src/modules/performance/position-performance.controller.ts',
    ];
    for (const file of files) {
      const content = readSource(file);
      // marketValue minus raw buys (ignores sells/fees) is prohibited.
      expect(content, file).not.toMatch(/totalBuys/);
      // Current-weight x return approximations are prohibited.
      expect(content, file).not.toMatch(/currentWeight/);
      expect(content, file).not.toMatch(
        /weightStart\s*\*\s*positionReturn|positionReturn\s*\*\s*weightStart/,
      );
    }
    const useCase = readSource(
      'apps/api/src/application/performance/get-position-performance.use-case.ts',
    );
    // The shared TWR engine is the only return math allowed.
    expect(useCase).toContain('calculatePositionTwr');
    expect(useCase).toContain('attributePositionContributions');
    expect(useCase).toContain('sumPositionRealized');
  });

  it('performance read is derived only: no ledger, transaction or strategy writes', () => {
    const content = readSource(
      'apps/api/src/application/performance/get-position-performance.use-case.ts',
    );
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).not.toMatch(/transactions\.(create|createMany|update|delete)/);
    expect(content).not.toMatch(/CreateTransactionUseCase/);
    expect(content).not.toMatch(/@atlas\/b3-integration|@atlas\/tax-engine/);
    expect(content).not.toMatch(/@nestjs\/schedule|node-cron|setInterval|setTimeout|bullmq/);
    expect(content).not.toMatch(/parseFloat/);
    expect(content).toContain('replayPortfolioTimeline');
    expect(content).toContain('findByPortfolioId');
    expect(content).toContain('getDailyPrice');
  });

  it('performance API exposes no mutation, scheduling or execution paths', () => {
    const controller = readSource(
      'apps/api/src/modules/performance/position-performance.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('positions/:assetId/performance');
    expect(controller).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
  });

  it('zero migrations: performance stays derived', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(42);
    expect(migrations[migrations.length - 1]).toContain('add_reconciliation_decisions');
  });

  it('no ranking, recommendation, score or forecast language in the stack', () => {
    const files = [
      'packages/performance-engine/src/position-attribution.ts',
      'packages/performance-engine/src/position-performance.ts',
      'apps/api/src/application/performance/get-position-performance.use-case.ts',
      'apps/api/src/modules/performance/position-performance.controller.ts',
    ];
    const forbidden =
      /você deveria|deve (investir|comprar|vender)|recomendamos|ideal|ótimo|melhor ativo|pior ativo|top performer|buy now|sell now|should buy|should sell|comprar agora|vender agora|score|rating|target price|fair value|forecast|previsão|expected return|sharpe/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, scheduler or fiscal language in the stack', () => {
    const files = [
      'packages/performance-engine/src/position-attribution.ts',
      'packages/performance-engine/src/position-performance.ts',
      'apps/api/src/application/performance/get-position-performance.use-case.ts',
      'apps/api/src/modules/performance/position-performance.controller.ts',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|executar aporte|comprar agora|scheduler|cron|\bqueue\b|worker|fiscal/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
