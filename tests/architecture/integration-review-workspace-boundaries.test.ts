import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5S-B — reconciliation workspace boundaries.
 *
 * Workspace is a read-only comparison surface over persisted runs and
 * canonical transactions. No decision persistence exists, so no
 * mutation path may exist either: reads only, no transaction writers,
 * no GET-to-confirm, no auto-reconciliation.
 */
describe('Phase 5S-B: reconciliation workspace boundaries', () => {
  it('comparison engine stays pure: no Nest/Prisma/database/UI/network/clock/floats', () => {
    const content = readSource('packages/portfolio-strategy/src/reconciliation.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/setInterval|setTimeout|cron|schedule/i);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/fetch\(|axios/i);
    expect(content).not.toMatch(/process\.env/);
    expect(content).not.toMatch(/parseFloat|\bNumber\(/);
    expect(content).toContain('compareReconciliationFacts');
    expect(content).not.toMatch(/score|confidence|fuzzy|similarity|probability/i);
  });

  it('review service never writes: no run/transaction/persistence mutations', () => {
    const content = readSource('apps/api/src/application/imports/integration-review.service.ts');
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).not.toMatch(/recordConfirmation|recordPreview|recordFailure/);
    expect(content).not.toMatch(/linkTransactions|createMany/);
    expect(content).not.toMatch(/executeMany|CreateTransactionUseCase/);
    expect(content).not.toMatch(
      /confirmMatch|rejectMatch|acceptReview|dismissReview|reviewDecision|reconciliationDecision/i,
    );
    expect(content).toContain('listTransactionIdsByRun');
    expect(content).toContain('findByIds');
    expect(content).toContain('SOURCE_FACTS_NOT_PERSISTED');
  });

  it('no decision persistence exists anywhere in the workspace path', () => {
    const files = [
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/api/src/modules/reviews/integration-reviews.controller.ts',
      'apps/api/src/modules/reviews/dto/integration-review.dto.ts',
    ];
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(
        /reconciliationDecision|reviewDecision|reviewAction|confirmMatch|rejectMatch/i,
      );
    }
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(41);
    const schema = readSource('packages/database/prisma/schema.prisma');
    expect(schema).not.toMatch(
      /model ReviewDecision|model ReconciliationDecision|model ReviewAction/i,
    );
  });

  it('review API exposes no mutation or confirmation paths', () => {
    const controller = readSource('apps/api/src/modules/reviews/integration-reviews.controller.ts');
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).not.toMatch(/Post\(|Put\(|Patch\(|Delete\(/);
    expect(controller).not.toMatch(/confirmMatch|rejectMatch|acceptReview|dismissReview/i);
  });

  it('workspace never infers classifications from names, tickers or currencies', () => {
    const files = [
      'packages/portfolio-strategy/src/reconciliation.ts',
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/web/src/app/(app)/reviews/[runId]/page.tsx',
      'apps/mobile/app/(app)/reviews/[runId].tsx',
    ];
    const heuristic =
      /startsWith|endsWith|toUpperCase\(\)|toLowerCase\(|currency\s*===?\s*['"]BRL['"]|exchange\s*===?\s*['"]B3['"]|ticker\s*===?\s*['"][A-Z]/;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(heuristic);
    }
  });

  it('no score, confidence, fuzzy, advice or provider-secret language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/reconciliation.ts',
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/api/src/modules/reviews/integration-reviews.controller.ts',
      'apps/web/src/app/(app)/reviews/page.tsx',
      'apps/web/src/app/(app)/reviews/[runId]/page.tsx',
      'apps/mobile/app/(app)/reviews.tsx',
      'apps/mobile/app/(app)/reviews/[runId].tsx',
    ];
    const forbidden =
      /score|confidence|provavelmente|melhor correspondência|recomendamos confirmar|seguro confirmar|forecast|previsão|expected return|sharpe|buy now|sell now|secret|certificate|password|clientSecret|fingerprint/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });

  it('no B3, broker, order, auto-fix or transaction-mutation language in the stack', () => {
    const files = [
      'packages/portfolio-strategy/src/reconciliation.ts',
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/web/src/app/(app)/reviews/[runId]/page.tsx',
      'apps/mobile/app/(app)/reviews/[runId].tsx',
    ];
    const forbidden =
      /\bB3\b|corretora|broker|enviar ordem|auto-?accept|auto-?confirm|auto-?fix|auto-?correct|createTransaction|updateTransaction|deleteTransaction|scheduler|cron|\bqueue\b|worker/i;
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
