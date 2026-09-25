import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: Grounded Claim Validation boundaries (Phase 3T, ADR-193–ADR-198)', () => {
  it('1. AI Engine has zero UI dependencies (@atlas/ui, react, react-native, expo)', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/@atlas\/ui/i);
    expect(c).not.toMatch(/from ['"]react['"]/i);
    expect(c).not.toMatch(/from ['"]react-native['"]/i);
    expect(c).not.toMatch(/from ['"]expo/i);
  });

  it('2. Core financial engines cannot import AI claim validation (@atlas/ai-engine)', () => {
    const coreEngines = [
      'packages/domain/src/index.ts',
      'packages/portfolio-engine/src/engine.ts',
      'packages/performance-engine/src/index.ts',
      'packages/risk-engine/src/index.ts',
      'packages/benchmark-engine/src/index.ts',
      'packages/scenario-engine/src/index.ts',
      'packages/portfolio-intelligence/src/index.ts',
      'packages/valuation-engine/src/index.ts',
    ];

    for (const file of coreEngines) {
      const content = read(file);
      expect(content, `${file} must not import @atlas/ai-engine`).not.toMatch(/@atlas\/ai-engine/i);
    }
  });

  it('3. Claim validation and rendering are pure functions with zero I/O, zero network, zero database', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/axios/i);
    expect(c).not.toMatch(/@nestjs\//);
  });

  it('4. Claim validation enforces server authority: formatFactValueForDisplay uses exact decimal strings without float conversion', () => {
    const c = read('packages/ai-engine/src/index.ts');
    // Ensure formatExactDecimalString does not use parseFloat
    expect(c).not.toMatch(/parseFloat\(/);
    expect(c).not.toMatch(/Number\(valueStr\)/);
  });

  it('5. API use cases validate claims and fail closed before persisting or returning response', () => {
    const useCases = [
      'apps/api/src/application/ai/explain-portfolio-with-ai.use-case.ts',
      'apps/api/src/application/ai/send-ai-conversation-message.use-case.ts',
    ];

    for (const file of useCases) {
      const content = read(file);
      expect(content, `${file} must call validateGroundedClaims`).toMatch(
        /validateGroundedClaims\(/,
      );
      expect(content, `${file} must call renderValidatedClaims`).toMatch(/renderValidatedClaims\(/);
      expect(content, `${file} must fail closed on invalid claims`).toMatch(
        /claimValidation\.valid/,
      );
    }
  });
});
