import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: AI Observability & Usage Governance Boundaries (Phase 3V, ADR-204–ADR-209)', () => {
  it('1. Core financial engines cannot import AI observability or telemetry layer', () => {
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
      expect(content, `${file} must not import ai-engine`).not.toMatch(/@atlas\/ai-engine/i);
      expect(content, `${file} must not reference telemetry`).not.toMatch(/telemetry/i);
    }
  });

  it('2. AI Engine is a pure deterministic package with zero logger, Prisma, or HTTP I/O', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/logger'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/axios/i);
    expect(c).not.toMatch(/@nestjs\//);
  });

  it('3. Client applications (web, mobile, ui) never import provider telemetry sink', () => {
    const clientPackageJsons = [
      'apps/web/package.json',
      'apps/mobile/package.json',
      'packages/ui/package.json',
    ];

    for (const p of clientPackageJsons) {
      const content = read(p);
      expect(content).not.toMatch(/ai-telemetry\.sink/);
    }
  });

  it('4. Low-cardinality metric labels: sensitive IDs (userId, portfolioId, conversationId, requestId) forbidden in extractSafeMetricLabels', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).toContain('export function extractSafeMetricLabels');

    // Check that extractSafeMetricLabels only maps bounded categorical dimensions
    const funcMatch = c.match(
      /function extractSafeMetricLabels[\s\S]*?return Object\.freeze\(\{[\s\S]*?\}\);/,
    );
    expect(funcMatch).not.toBeNull();
    if (funcMatch) {
      expect(funcMatch[0]).not.toContain('telemetry.requestId');
      expect(funcMatch[0]).not.toContain('telemetry.userId');
      expect(funcMatch[0]).not.toContain('telemetry.portfolioId');
      expect(funcMatch[0]).not.toContain('telemetry.conversationId');
    }
  });

  it('5. Provider token usage parsing is strictly isolated in OpenAI AI provider infrastructure', () => {
    const providerCode = read('apps/api/src/infrastructure/ai/openai-ai.provider.ts');
    expect(providerCode).toContain('prompt_tokens');
    expect(providerCode).toContain('completion_tokens');
    expect(providerCode).toContain('total_tokens');

    // Telemetry sink does not call OpenAI API or parse OpenAI wire responses
    const sinkCode = read('apps/api/src/infrastructure/ai/ai-telemetry.sink.ts');
    expect(sinkCode).not.toContain('https://api.openai.com');
    expect(sinkCode).not.toContain('prompt_tokens');
  });

  it('6. Telemetry sink failures are fail-open (never throw or block API use cases)', () => {
    const syncUseCase = read(
      'apps/api/src/application/ai/send-ai-conversation-message.use-case.ts',
    );
    const streamUseCase = read(
      'apps/api/src/application/ai/stream-ai-conversation-message.use-case.ts',
    );

    expect(syncUseCase).toContain('this.telemetrySink.record(');
    expect(syncUseCase).toContain('// Fail-open guarantee (ADR-204)');
    expect(streamUseCase).toContain('this.telemetrySink.record(');
    expect(streamUseCase).toContain('// Fail-open guarantee (ADR-204)');
  });
});
