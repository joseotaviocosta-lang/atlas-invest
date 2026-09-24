import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Architecture guard (Fase 2F / ADR-089): the client must never reconstruct
 * portfolio history from transaction events. Historical state always comes
 * from the server replay via `asOf`.
 *
 * Scans every Fase 2F presentation file for replay-like patterns:
 * date-filtering transactions to derive state, quantity/cost recomputation,
 * average-cost math, and replay loops over raw ledgers.
 */
describe('Architecture Gate: No Client-Side Historical Replay (Fase 2F)', () => {
  const rootDir = path.resolve(__dirname, '../..');

  const inScopeFiles = [
    'packages/ui/src/view-models/portfolio-temporal-context.view-model.ts',
    'packages/ui/src/view-models/portfolio-accounts.view-model.ts',
    'apps/web/src/components/portfolio/PortfolioDateSelector.tsx',
    'apps/web/src/components/portfolio/PortfolioHistoricalBanner.tsx',
    'apps/web/src/app/(app)/portfolio/page.tsx',
    'apps/web/src/app/(app)/portfolio/assets/[assetId]/page.tsx',
    'apps/web/src/app/(app)/portfolio/accounts/page.tsx',
    'apps/web/src/app/(app)/portfolio/accounts/[accountId]/page.tsx',
    'apps/mobile/src/components/portfolio/MobileDateSelector.tsx',
    'apps/mobile/src/components/portfolio/MobileHistoricalBanner.tsx',
    'apps/mobile/src/components/portfolio/PositionCard.tsx',
    'apps/mobile/app/(app)/(tabs)/portfolio.tsx',
    'apps/mobile/app/(app)/portfolio/[assetId].tsx',
    'apps/mobile/app/(app)/portfolio/accounts.tsx',
    'apps/mobile/app/(app)/portfolio/accounts/[accountId].tsx',
    'apps/mobile/app/(app)/portfolio/history.tsx',
    'apps/mobile/app/(app)/portfolio/income.tsx',
    'apps/mobile/app/(app)/portfolio/cash-flow.tsx',
  ];

  const forbiddenPatterns: Array<{ name: string; regex: RegExp }> = [
    {
      name: 'filters transactions by tradeDate to derive state',
      regex: /transactions\s*\.\s*filter\s*\([^)]*tradeDate/i,
    },
    {
      name: 'reduces quantities client-side',
      regex: /\bquantity\b[^;]*\.reduce\s*\(/i,
    },
    {
      // Real computation (`averageCost = …`), not JSX prop passing (`averageCost={`).
      name: 'computes average cost via division',
      regex: /totalCost\s*\/\s*quantity|\baverageCost\s*=\s*(?![>{\s])/i,
    },
    {
      name: 'calls replayPortfolio on the client',
      regex: /replayPortfolio\s*\(/,
    },
    {
      name: 'imports the portfolio engine replay in UI code',
      regex: /from\s+['"]@atlas\/portfolio-engine['"]/,
    },
  ];

  for (const file of inScopeFiles) {
    it(`contains no client-side replay in ${file}`, () => {
      const fullPath = path.join(rootDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const { name, regex } of forbiddenPatterns) {
        expect(
          content,
          `${file} must not contain client-side historical replay (${name})`,
        ).not.toMatch(regex);
      }

      // Positive guard: historical reads must reference the asOf contract.
      if (file.includes('app/(app)/portfolio/page.tsx') || file.includes('(tabs)/portfolio.tsx')) {
        expect(content).toMatch(/asOf/);
      }
    });
  }
});
