import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: AI Grounding boundaries (Phase 3Q, ADR-173–ADR-178)', () => {
  it('ai-engine is zero I/O, pure, and has no database or network dependencies', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/axios/i);
    expect(c).not.toMatch(/@nestjs\//);
    expect(c).not.toMatch(/import React/);
  });

  it('ai-engine cannot calculate financial formulas or replay ledgers', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/calculateSharpeRatio|calculateSortinoRatio|calculateBeta/);
    expect(c).not.toMatch(/calculateTWR|calculateXIRR|calculateRiskMetrics/);
    expect(c).not.toMatch(/calculateHistoricalVar|calculateHistoricalCvar/);
    expect(c).not.toMatch(/replayPortfolio|replayPortfolioTimeline/);
    expect(c).not.toMatch(/Math\.sqrt|Math\.pow|parseFloat|Number\(/);
  });

  it('ai-engine does not invoke model providers (OpenAI, Anthropic, Gemini)', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/from ['"]openai['"]/i);
    expect(c).not.toMatch(/from ['"]@anthropic-ai/i);
    expect(c).not.toMatch(/from ['"]@google\/genai/i);
    expect(c).not.toMatch(/generateText|createCompletion|createChatCompletion/i);
  });

  it('ai-engine does not import authentication secrets or tokens', () => {
    const c = read('packages/ai-engine/src/index.ts');
    expect(c).not.toMatch(/argon2|bcrypt|jsonwebtoken/i);
    expect(c).not.toMatch(/jwtSecret|refreshTokenPepper|jwt_secret/i);
  });

  it('engines and portfolio-intelligence cannot import ai-engine', () => {
    const forbiddenFiles = [
      'packages/portfolio-engine/src/engine.ts',
      'packages/performance-engine/src/index.ts',
      'packages/risk-engine/src/index.ts',
      'packages/benchmark-engine/src/index.ts',
      'packages/scenario-engine/src/index.ts',
      'packages/portfolio-intelligence/src/index.ts',
      'packages/valuation-engine/src/index.ts',
    ];

    for (const f of forbiddenFiles) {
      const c = read(f);
      expect(c, `File ${f} must not import ai-engine`).not.toMatch(/ai-engine|@atlas\/ai-engine/i);
    }
  });

  it('ai grounding use-case calls Portfolio Intelligence Summary exactly once and does not call model providers', () => {
    const c = read('apps/api/src/application/ai/get-portfolio-ai-grounding-context.use-case.ts');
    expect(c).toContain('GetPortfolioIntelligenceSummaryUseCase');
    expect(c).toContain('buildPortfolioAiGroundingContext');
    expect(c).not.toMatch(/openai|anthropic|gemini/i);
    expect(c).not.toMatch(/calculateSharpe|calculateBeta|calculateTWR/i);
  });
});
