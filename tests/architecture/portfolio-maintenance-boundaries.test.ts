import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5S-D — data maintenance is navigation + existing writers only.
 *
 * The maintenance layer classifies 5R-E issues; it never invents a
 * writer, never overrides a calculated result, and adds no tables.
 */
describe('Phase 5S-D: data maintenance boundaries', () => {
  it('maintenance policy never directs arbitrary financial overrides', () => {
    const policy = readSource('packages/portfolio-strategy/src/maintenance.ts');
    expect(policy).not.toMatch(/averageCost|costBasis\s*=|setAverageCost/i);
    expect(policy).not.toMatch(/realizedPnL|realizedGainLoss\s*=/i);
    expect(policy).not.toMatch(/marketValue\s*=|portfolioWeight|allocationWeight/i);
    expect(policy).not.toMatch(/\b(fixAll|autoFix|confidence|fuzzy|similarity|probability)\b/);
    expect(policy).toContain('deriveMaintenanceAction');
    expect(policy).toContain('MANUAL_MARKET_DATA_DEFERRED');
  });

  it('maintenance has no new persistence: zero migrations beyond 5S-C', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(43);
    expect(migrations[migrations.length - 1]).toContain('add_transaction_rectifications');
    const compose = readSource(
      'apps/api/src/application/portfolios/portfolio-maintenance.compose.ts',
    );
    expect(compose).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(compose).toContain('composePortfolioDataQuality');
  });

  it('maintenance endpoint is read-only: GET only, ownership enforced', () => {
    const controller = readSource(
      'apps/api/src/modules/portfolios/portfolio-maintenance.controller.ts',
    );
    expect(controller).toContain('@Get()');
    expect(controller).not.toMatch(/@Post\(|@Put\(|@Patch\(|@Delete\(/);
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('api/v1/portfolios/:portfolioId/maintenance');
  });

  it('maintenance reuses the 5R-E composer (no new detection, no extra replay)', () => {
    const compose = readSource(
      'apps/api/src/application/portfolios/portfolio-maintenance.compose.ts',
    );
    expect(compose).toContain('composePortfolioDataQuality');
    expect(compose).not.toMatch(/replayPortfolio|deriveReviewItems|buildIssue/);
    const strategy = readSource('packages/portfolio-strategy/src/maintenance.ts');
    expect(strategy).not.toMatch(/@nestjs|@prisma\/client|@atlas\/database/);
    expect(strategy).not.toMatch(/Date\.now\(\)|new Date\(\s*\)/);
    expect(strategy).not.toMatch(/fetch\(|axios/i);
  });

  it('operations summary reuses the same policy without new attention', () => {
    const compose = readSource(
      'apps/api/src/application/portfolios/portfolio-operations.compose.ts',
    );
    expect(compose).toContain('deriveMaintenanceAction');
    expect(compose).toContain('maintenance: summarizeMaintenance(quality)');
    const operations = readSource('packages/portfolio-strategy/src/operations.ts');
    expect(operations).not.toMatch(/MAINTENANCE|maintenance/i);
  });
});
