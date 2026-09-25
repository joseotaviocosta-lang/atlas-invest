import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: AI Explanation boundaries (Phase 3R, ADR-179–ADR-185)', () => {
  it('1. Core financial engines cannot import AI layer (@atlas/ai-engine)', () => {
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

  it('2. Portfolio intelligence cannot import AI provider adapter', () => {
    const content = read('packages/portfolio-intelligence/src/index.ts');
    expect(content).not.toMatch(/OpenAiProvider|AI_PROVIDER_TOKEN/i);
    expect(content).not.toMatch(/from ['"]openai['"]/i);
  });

  it('3. AI explanation use-case cannot import Prisma directly', () => {
    const content = read('apps/api/src/application/ai/explain-portfolio-with-ai.use-case.ts');
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/PrismaService/);
    expect(content).not.toMatch(/PRISMA_CLIENT/);
  });

  it('4. AI explanation use-case cannot import portfolio repository directly', () => {
    const content = read('apps/api/src/application/ai/explain-portfolio-with-ai.use-case.ts');
    expect(content).not.toMatch(/PortfolioRepository/);
    expect(content).not.toMatch(/PORTFOLIO_REPOSITORY/);
  });

  it('5. AI explanation use-case cannot import market data providers directly', () => {
    const content = read('apps/api/src/application/ai/explain-portfolio-with-ai.use-case.ts');
    expect(content).not.toMatch(/MarketDataProvider/);
    expect(content).not.toMatch(/HistoricalMarketDataProvider/);
    expect(content).not.toMatch(/HISTORICAL_MARKET_DATA_PROVIDER/);
  });

  it('6. Web client cannot import provider SDK or expose server-only OpenAI keys', () => {
    const webPage = read('apps/web/src/app/(app)/ai/page.tsx');
    expect(webPage).not.toMatch(/from ['"]openai['"]/i);
    expect(webPage).not.toMatch(/OPENAI_API_KEY/);
    expect(webPage).not.toMatch(/process\.env\.OPENAI/);

    // Client package.json must not have openai dependency
    const pkg = read('apps/web/package.json');
    expect(pkg).not.toMatch(/['"]openai['"]/i);
  });

  it('7. Mobile client cannot import provider SDK or expose server-only OpenAI keys', () => {
    const mobileScreen = read('apps/mobile/app/(app)/(tabs)/ai.tsx');
    expect(mobileScreen).not.toMatch(/from ['"]openai['"]/i);
    expect(mobileScreen).not.toMatch(/OPENAI_API_KEY/);
    expect(mobileScreen).not.toMatch(/process\.env\.OPENAI/);

    const pkg = read('apps/mobile/package.json');
    expect(pkg).not.toMatch(/['"]openai['"]/i);
  });

  it('8. Provider adapter cannot be imported into domain engines', () => {
    const domainContent = read('packages/domain/src/index.ts');
    expect(domainContent).not.toMatch(/openai/i);
    expect(domainContent).not.toMatch(/OpenAiProvider/);
  });

  it('9. Unsupported intent path cannot invoke provider (intent gate runs before grounding/model)', () => {
    const content = read('apps/api/src/application/ai/explain-portfolio-with-ai.use-case.ts');
    // Intent classification must occur before grounding acquisition.
    const classifyIdx = content.indexOf('classifyExplanationIntent');
    const groundingIdx = content.indexOf('getGroundingContextUseCase.execute');
    const providerIdx = content.indexOf('aiProvider.complete');
    expect(classifyIdx).toBeGreaterThanOrEqual(0);
    expect(groundingIdx).toBeGreaterThan(classifyIdx);
    expect(providerIdx).toBeGreaterThan(groundingIdx);
    // Unsupported branch must return before any grounding/provider call.
    expect(content).toMatch(/UNSUPPORTED_RECOMMENDATION/);
    expect(content).toMatch(/ZERO grounding calls, ZERO provider calls|0 model calls/);
  });

  it('10. AI explanation client view-model performs no financial math', () => {
    const vm = read('packages/ui/src/view-models/portfolio-ai-explanation.view-model.ts');
    expect(vm).not.toMatch(/Math\.pow|Math\.sqrt/);
    expect(vm).not.toMatch(/parseFloat/);
    expect(vm).not.toMatch(/Number\(/);
    expect(vm).not.toMatch(/calculateSharpe|calculateBeta|calculateTWR|expectedReturn|covariance/);
  });

  it('11. AI endpoint has stricter rate limit than ordinary reads', () => {
    const controller = read('apps/api/src/modules/ai/ai.controller.ts');
    expect(controller).toMatch(/@Throttle\(\{\s*default:\s*\{\s*limit:\s*20,\s*ttl:\s*60000/);
  });
});
