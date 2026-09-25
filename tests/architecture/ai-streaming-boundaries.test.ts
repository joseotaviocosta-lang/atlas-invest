import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: Grounded AI Streaming Boundaries (Phase 3U, ADR-199–ADR-203)', () => {
  it('1. AI Engine streaming layer has zero UI dependencies (@atlas/ui, react, react-native, expo)', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/@atlas\/ui/i);
    expect(c).not.toMatch(/from ['"]react['"]/i);
    expect(c).not.toMatch(/from ['"]react-native['"]/i);
    expect(c).not.toMatch(/from ['"]expo/i);
  });

  it('2. Core financial engines cannot import AI streaming logic (@atlas/ai-engine)', () => {
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
      expect(content, `${file} must not import @atlas/ai-engine`).not.toMatch(
        /@atlas\/ai-engine/i,
      );
    }
  });

  it('3. Stream emitter and SSE helpers are pure functions with zero I/O, zero network, zero database', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/axios/i);
    expect(c).not.toMatch(/@nestjs\//);
  });

  it('4. Stream use cases enforce verifyOwnership before committing headers and validate claims before FINAL', () => {
    const streamUseCase = read(
      'apps/api/src/application/ai/stream-ai-conversation-message.use-case.ts',
    );
    expect(streamUseCase).toContain('verifyOwnership');
    expect(streamUseCase).toContain('validateGroundedClaims');
    expect(streamUseCase).toContain('renderValidatedClaims');
    expect(streamUseCase).toContain('emitFinal');
    expect(streamUseCase).toContain('emitError');
  });

  it('5. Stream use case and controller never leak OPENAI_API_KEY or provider tokens', () => {
    const files = [
      'apps/api/src/application/ai/stream-ai-conversation-message.use-case.ts',
      'apps/api/src/modules/ai/ai.controller.ts',
      'packages/ai-engine/src/index.ts',
    ];

    for (const file of files) {
      const content = read(file);
      expect(content).not.toMatch(/process\.env\.OPENAI_API_KEY/);
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    }
  });

  it('6. ADR-200 invariant: No partial financial authority streamed; progress stages have zero numeric values', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).toContain('export const CANONICAL_PROGRESS_MESSAGES');
    // Ensure CANONICAL_PROGRESS_MESSAGES block does not contain currency or numbers
    const blockMatch = c.match(/CANONICAL_PROGRESS_MESSAGES[\s\S]*?\}\);/);
    expect(blockMatch).not.toBeNull();
    if (blockMatch) {
      expect(blockMatch[0]).not.toMatch(/\d/);
      expect(blockMatch[0]).not.toMatch(/R\$|BRL|USD|%/);
    }
  });
});
