import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5S-C — rectification is append-only, never update/delete.
 *
 * The original transaction is never mutated: a compensating reversal
 * plus an optional replacement are committed atomically with an audit
 * link. Guards below pin that invariant statically.
 */
describe('Phase 5S-C: transaction rectification boundaries', () => {
  it('rectification path never updates or deletes a transaction', () => {
    const useCase = readSource(
      'apps/api/src/application/transactions/rectify-portfolio-transaction.use-case.ts',
    );
    expect(useCase).not.toMatch(/transactionRepository\.(update|delete|upsert)/);
    expect(useCase).not.toMatch(/\.transaction\.update\(|\.transaction\.delete\(/);
    expect(useCase).not.toMatch(/UPDATE\s+"?transactions"?/i);
    expect(useCase).not.toMatch(/DELETE\s+FROM\s+"?transactions"?/i);
    expect(useCase).toContain('createWithTransactions');
    expect(useCase).toContain('DuplicateExternalTransactionError');
  });

  it('rectification repository only appends: no update/delete surface', () => {
    const content = readSource(
      'packages/database/src/repositories/transaction-rectification.repository.ts',
    );
    expect(content).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/);
    expect(content).toContain('createWithTransactions');
    expect(content).toContain('findByOriginalTransactionId');
    expect(content).toContain('resolveEffectiveTransactionId');
  });

  it('reconciliation history stays untouched by rectification', () => {
    const useCase = readSource(
      'apps/api/src/application/transactions/rectify-portfolio-transaction.use-case.ts',
    );
    expect(useCase).not.toMatch(/reconciliationDecision.*\.(update|delete|create)/i);
    expect(useCase).not.toMatch(/integrationRunTransaction/i);
    const review = readSource('apps/api/src/application/imports/integration-review.service.ts');
    expect(review).not.toMatch(/rectification.*\.(create|update|delete)/i);
  });

  it('reason is required and bounded; no raw principal in responses', () => {
    const dto = readSource('apps/api/src/modules/transactions/dto/rectify-transaction.dto.ts');
    expect(dto).toContain('reason');
    expect(dto).toMatch(/min\(1\)/);
    expect(dto).toMatch(/max\(500\)/);
    const controller = readSource('apps/api/src/modules/transactions/transactions.controller.ts');
    expect(controller).toContain('rectificationId');
    expect(controller).toContain('effectiveTransactionId');
    expect(controller).not.toMatch(/decidedByPrincipal|userId.*rectification/i);
  });

  it('additive migration only: one new table, ledger untouched', () => {
    const migrations = fs
      .readdirSync(path.join(rootDir, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry));
    expect(migrations).toHaveLength(48);
    expect(migrations[migrations.length - 1]).toContain('add_transaction_rectifications');
    const schema = readSource('packages/database/prisma/schema.prisma');
    expect(schema).toContain('model TransactionRectificationRecord');
  });
});
