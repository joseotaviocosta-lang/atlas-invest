import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.join(__dirname, '..', '..');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('Phase 4K.4 — Tax Compliance Action Center Architecture Boundaries', () => {
  const engineFiles = [
    'packages/tax-engine/src/compliance/action-center-types.ts',
    'packages/tax-engine/src/compliance/action-center-engine.ts',
  ];

  const useCaseFiles = [
    'apps/api/src/application/fiscal/get-tax-compliance-action-center.use-case.ts',
    'apps/api/src/application/fiscal/get-tax-compliance-calendar.use-case.ts',
  ];

  const clientFiles = [
    'apps/web/src/components/fiscal/TaxComplianceActionCenterSection.tsx',
    'apps/mobile/src/components/fiscal/TaxComplianceActionCenterCard.tsx',
    'packages/ui/src/view-models/tax-compliance-action-center.view-model.ts',
  ];

  it('action-center engine modules are pure: no Nest/Prisma/database/React/network imports', () => {
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

  it('action-center engine performs zero float math on financial values', () => {
    for (const file of engineFiles) {
      const content = readFile(file);
      expect(content, `${file} must not use parseFloat`).not.toMatch(/parseFloat/);
      // Number(...) coercion is banned; Number.isInteger as a type guard is allowed.
      const coercions = content.match(/Number\s*\([^)]/g) ?? [];
      expect(coercions, `${file} must not coerce with Number()`).toEqual([]);
      expect(content, `${file} must not use Math.* float helpers`).not.toMatch(
        /Math\.(round|floor|ceil|pow|sqrt|abs|trunc)\s*\(/,
      );
    }
  });

  it('action-center API use-cases never recompute tax, due dates, penalties or government verification', () => {
    for (const file of useCaseFiles) {
      const content = readFile(file);
      expect(content, `${file} must not use parseFloat`).not.toMatch(/parseFloat/);
      expect(content, `${file} must not compute penalties`).not.toMatch(
        /lateFee|selic|penalty|interest/i,
      );
      expect(content, `${file} must not claim government verification`).not.toMatch(
        /GOVERNMENT_VERIFIED|RECEITA_CONFIRMED|PAID_BY_GOVERNMENT/,
      );
      expect(content, `${file} must not import Prisma directly`).not.toMatch(
        /from ['"]@prisma\/client['"]/,
      );
    }
  });

  it('action-center clients never calculate fiscal figures or import the tax engine', () => {
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

  it('action-center controller routes stay authenticated and private/no-store', () => {
    const content = readFile('apps/api/src/modules/fiscal/fiscal.controller.ts');
    expect(content).toMatch(/compliance\/action-center/);
    expect(content).toMatch(/compliance\/calendar/);
    const actionCenterBlock = content.slice(
      content.indexOf('compliance/action-center'),
      content.indexOf('compliance/action-center') + 4000,
    );
    expect(actionCenterBlock).toMatch(/private, no-store/);
  });
});
