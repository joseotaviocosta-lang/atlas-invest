import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5Q-A — review architecture boundaries.
 *
 * The review is a derived read model: pure derivation in the new engine
 * package, one read-only aggregating use-case, no new tables, no ledger
 * writers, no B3 transport in the presentation path, and no scheduler
 * internals leaking into UI.
 */
describe('Phase 5Q-A: portfolio review architecture boundaries', () => {
  it('review derivation is pure: no Nest/Prisma/database/UI/network/clock', () => {
    for (const file of [
      'packages/portfolio-review/src/types.ts',
      'packages/portfolio-review/src/policy.ts',
      'packages/portfolio-review/src/derive-review.ts',
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
    }
  });

  it('review use-case and controller never touch ledger writers, live B3 or fiscal engines', () => {
    for (const file of [
      'apps/api/src/application/portfolios/get-portfolio-review.use-case.ts',
      'apps/api/src/modules/portfolios/portfolio-review.controller.ts',
      'apps/api/src/modules/portfolios/portfolio-review.mapper.ts',
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
      expect(content, file).not.toMatch(/parseFloat|Math\.pow/);
    }
  });

  it('web review surface never imports scheduler internals, DB repos or B3 transport', () => {
    for (const file of [
      'apps/web/src/components/portfolio/PortfolioReviewSection.tsx',
      'apps/web/src/app/(app)/portfolio/page.tsx',
      'apps/web/src/app/(app)/today/page.tsx',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/node-cron/);
      expect(content, file).not.toMatch(/claimDue|markSucceeded|markCancelled/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration|@atlas\/import-engine/);
      expect(content, file).not.toMatch(/@atlas\/database/);
    }
  });

  it('review view-model stays presentation-only', () => {
    const content = readSource('packages/ui/src/view-models/portfolio-review.view-model.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/fetch\(|axios/);
    expect(content).not.toMatch(/parseFloat|Math\.pow/);
  });

  it('no review persistence enters the schema', () => {
    const schema = readSource('packages/database/prisma/schema.prisma');
    expect(schema).not.toMatch(/model\s+(PortfolioReview|ReviewSignal|ReviewItem)\b/);
    const migrationsDir = path.join(rootDir, 'packages/database/prisma/migrations');
    for (const entry of fs.readdirSync(migrationsDir)) {
      if (entry === 'migration_lock.toml') continue;
      const sql = fs.readFileSync(path.join(migrationsDir, entry, 'migration.sql'), 'utf8');
      expect(sql, entry).not.toMatch(/CREATE TABLE\s+"(portfolio_reviews|review_signals)"/i);
    }
  });

  it('review API stays ownership-guarded and read-only', () => {
    const controller = readSource('apps/api/src/modules/portfolios/portfolio-review.controller.ts');
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).not.toMatch(/@Post|@Patch|@Delete|@Put/);
    expect(controller).toContain("@Controller('api/v1/portfolios/:portfolioId/review')");
  });

  it('mobile review surface never imports schedulers, DB repos or B3 transport', () => {
    for (const file of [
      'apps/mobile/src/components/portfolio/MobileReviewSection.tsx',
      'apps/mobile/src/api/review.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@atlas\/b3-integration|@atlas\/import-engine/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/SimulatedB3|B3Http/);
    }
  });
});
