import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.join(__dirname, '..', '..');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('Phase 4K.5 — Period Close Architecture Boundaries', () => {
  const engineFiles = [
    'packages/tax-engine/src/compliance/period-close-types.ts',
    'packages/tax-engine/src/compliance/period-close-engine.ts',
  ];

  const useCaseFiles = [
    'apps/api/src/application/fiscal/get-period-close-readiness.use-case.ts',
    'apps/api/src/application/fiscal/close-compliance-period.use-case.ts',
    'apps/api/src/application/fiscal/reopen-compliance-period.use-case.ts',
    'apps/api/src/application/fiscal/export-period-close-binder.use-case.ts',
    'apps/api/src/application/fiscal/list-period-close-history.use-case.ts',
  ];

  const clientFiles = [
    'apps/web/src/components/fiscal/TaxCompliancePeriodCloseSection.tsx',
    'apps/mobile/src/components/fiscal/TaxCompliancePeriodCloseCard.tsx',
    'packages/ui/src/view-models/tax-compliance-period-close.view-model.ts',
  ];

  it('period-close engine modules are pure: no Nest/Prisma/database/React/network imports', () => {
    for (const file of engineFiles) {
      const content = readFile(file);
      expect(content, `${file} must not import @nestjs`).not.toMatch(/@nestjs/);
      expect(content, `${file} must not import @prisma`).not.toMatch(/@prisma/);
      expect(content, `${file} must not import @atlas/database`).not.toMatch(/@atlas\/database/);
      expect(content, `${file} must not import react`).not.toMatch(/from ['"]react['"]/);
      expect(content, `${file} must not use fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(content, `${file} must not access the clock`).not.toMatch(/Date\.now\(\)/);
      expect(content, `${file} must not construct dates`).not.toMatch(/new Date\(\)/);
    }
  });

  it('period-close engine performs zero float math and zero fiscal recomputation', () => {
    for (const file of engineFiles) {
      const content = readFile(file);
      expect(content, `${file} must not use parseFloat`).not.toMatch(/parseFloat/);
      const coercions = content.match(/Number\s*\([^)]/g) ?? [];
      expect(coercions, `${file} must not coerce with Number()`).toEqual([]);
      expect(content, `${file} must not use Math.* float helpers`).not.toMatch(
        /Math\.(round|floor|ceil|pow|sqrt|abs|trunc)\s*\(/,
      );
      // The engine may only pull pure helpers (fingerprint, types, CSV
      // escaper); any fiscal computation module import is forbidden.
      expect(content, `${file} must not import fiscal computation modules`).not.toMatch(
        /from ['"]\.\.\/(?!annual-irpf\/csv-escape)[^'"]*['"]/,
      );
      expect(content, `${file} must not claim government verification`).not.toMatch(
        /GOVERNMENT_VERIFIED|RECEITA_CONFIRMED|PAID_BY_GOVERNMENT|OFFICIALLY_PAID/,
      );
    }
  });

  it('period-close API use-cases never recompute tax, verify payment or file officially', () => {
    for (const file of useCaseFiles) {
      const content = readFile(file);
      expect(content, `${file} must not use parseFloat`).not.toMatch(/parseFloat/);
      expect(content, `${file} must not compute penalties`).not.toMatch(
        /lateFee|selic|penalty|interest/i,
      );
      expect(content, `${file} must not claim government verification`).not.toMatch(
        /GOVERNMENT_VERIFIED|RECEITA_CONFIRMED|PAID_BY_GOVERNMENT/,
      );
      expect(content, `${file} must not file officially`).not.toMatch(
        /transmit.*receita|dirpf.*transmit|sicalc.*autom/i,
      );
      expect(content, `${file} must not import Prisma directly`).not.toMatch(
        /from ['"]@prisma\/client['"]/,
      );
    }
  });

  it('period-close clients never calculate fiscal figures or import the tax engine', () => {
    for (const file of clientFiles) {
      const content = readFile(file);
      expect(content, `${file} must not import @atlas/tax-engine`).not.toMatch(
        /@atlas\/tax-engine/,
      );
      expect(content, `${file} must not use parseFloat`).not.toMatch(/parseFloat/);
      expect(content, `${file} must not coerce with Number()`).not.toMatch(/Number\s*\(/);
      expect(content, `${file} must not use Math.*`).not.toMatch(/Math\.\w+\s*\(/);
    }
  });

  it('period-close controller routes stay authenticated and private/no-store', () => {
    const content = readFile('apps/api/src/modules/fiscal/fiscal.controller.ts');
    expect(content).toMatch(/compliance\/period-close\/readiness/);
    expect(content).toMatch(/compliance\/period-close\/binder\/export/);
    const block = content.slice(
      content.indexOf('compliance/period-close/readiness'),
      content.indexOf('compliance/period-close/readiness') + 2000,
    );
    expect(block).toMatch(/private, no-store/);
  });

  it('period-close persistence is append-only with a semantic revision barrier', () => {
    const sql = readFile(
      'packages/database/prisma/migrations/20261013000000_add_tax_compliance_period_close/migration.sql',
    );
    expect(sql).toContain('tax_compliance_period_close_records');
    expect(sql).toContain('tax_period_close_rev_uniq');
    // No data-mutating statements (ON UPDATE CASCADE in FK clauses is not a mutation).
    expect(sql).not.toMatch(/^\s*UPDATE\s+"/m);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    const repository = readFile(
      'packages/database/src/repositories/tax-period-close.repository.ts',
    );
    expect(repository).not.toMatch(/\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(/);
  });
});
