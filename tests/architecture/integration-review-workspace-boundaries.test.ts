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

  it('review service never writes: reads decisions, writes nothing', () => {
    const content = readSource('apps/api/src/application/imports/integration-review.service.ts');
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).not.toMatch(/recordConfirmation|recordPreview|recordFailure/);
    expect(content).not.toMatch(/linkTransactions|createMany/);
    expect(content).not.toMatch(/executeMany|CreateTransactionUseCase/);
    expect(content).not.toMatch(/confirmMatch|rejectMatch|acceptReview|dismissReview/i);
    expect(content).toContain('listTransactionIdsByRun');
    expect(content).toContain('findByIds');
    expect(content).toContain('listByRun');
    expect(content).toContain('SOURCE_FACTS_NOT_PERSISTED');
  });

  it('decision persistence exists only as the authorized append-only table', () => {
    const files = [
      'apps/api/src/application/imports/create-reconciliation-decision.use-case.ts',
      'apps/api/src/modules/reviews/integration-reviews.controller.ts',
      'apps/api/src/modules/reviews/dto/reconciliation-decision.dto.ts',
    ];
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/reviewDecisionRecord|reviewActionRecord/i);
    }
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(43);
    expect(migrations[migrations.length - 1]).toContain('add_transaction_rectifications');
    const schema = readSource('packages/database/prisma/schema.prisma');
    expect(schema).toContain('model ReconciliationDecisionRecord');
    expect(schema).not.toMatch(/model ReviewDecision|model ReviewAction/i);
  });

  it('review API exposes exactly one mutation: append-only decisions, nothing else', () => {
    const controller = readSource('apps/api/src/modules/reviews/integration-reviews.controller.ts');
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).not.toMatch(/Put\(|Patch\(|Delete\(/);
    const posts = controller.match(/Post\(/g) ?? [];
    expect(posts).toHaveLength(1);
    expect(controller).toContain("decisions')");
    expect(controller).toContain('ReconciliationDecisionBodySchema');
  });

  it('decision path never touches transaction writers or run state', () => {
    const files = [
      'apps/api/src/application/imports/create-reconciliation-decision.use-case.ts',
      'packages/database/src/repositories/reconciliation-decision.repository.ts',
    ];
    for (const file of files) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/executeMany|CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/Transaction\.create|Transaction\.update|\.delete\(/);
      expect(content, file).not.toMatch(/recordConfirmation|recordPreview|recordFailure/);
    }
    const usecase = readSource(
      'apps/api/src/application/imports/create-reconciliation-decision.use-case.ts',
    );
    expect(usecase).toContain('deriveSourceItemKey');
    expect(usecase).toContain('findByIdentity');
    expect(usecase).toContain('ConflictException');
  });

  it('workspace never infers classifications from names, tickers or currencies', () => {
    const files = [
      'packages/portfolio-strategy/src/reconciliation.ts',
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/web/src/app/(app)/reviews/[runId]/page.tsx',
      'apps/mobile/app/(app)/reviews/[runId].tsx',
    ];
    // Canonical case normalization only (fingerprint.ts precedent for
    // source identity keys); never ticker/name heuristics. startsWith,
    // endsWith, currency/exchange/ticker comparisons stay prohibited.
    const heuristic =
      /startsWith|endsWith|currency\s*===?\s*['"]BRL['"]|exchange\s*===?\s*['"]B3['"]|ticker\s*===?\s*['"][A-Z]/;
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
