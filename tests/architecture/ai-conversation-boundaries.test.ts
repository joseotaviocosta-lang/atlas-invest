import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: AI Conversation boundaries (Phase 3S, ADR-186–ADR-192)', () => {
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

  it('2. Conversation use cases cannot import Prisma directly', () => {
    const useCases = [
      'apps/api/src/application/ai/create-ai-conversation.use-case.ts',
      'apps/api/src/application/ai/list-ai-conversations.use-case.ts',
      'apps/api/src/application/ai/get-ai-conversation.use-case.ts',
      'apps/api/src/application/ai/send-ai-conversation-message.use-case.ts',
    ];

    for (const file of useCases) {
      const content = read(file);
      expect(content, `${file} must not import Prisma`).not.toMatch(/@prisma\/client/);
      expect(content, `${file} must not import PrismaService`).not.toMatch(/PrismaService/);
      expect(content, `${file} must not import PRISMA_CLIENT`).not.toMatch(/PRISMA_CLIENT/);
    }
  });

  it('3. Conversation repository cannot import financial calculation engines', () => {
    const content = read('packages/database/src/repositories/ai-conversation.repository.ts');
    expect(content).not.toMatch(/@atlas\/performance-engine/);
    expect(content).not.toMatch(/@atlas\/risk-engine/);
    expect(content).not.toMatch(/@atlas\/scenario-engine/);
    expect(content).not.toMatch(/@atlas\/valuation-engine/);
  });

  it('4. Conversation use cases cannot import market data providers directly', () => {
    const content = read('apps/api/src/application/ai/send-ai-conversation-message.use-case.ts');
    expect(content).not.toMatch(/MarketDataProvider/);
    expect(content).not.toMatch(/HistoricalMarketDataProvider/);
    expect(content).not.toMatch(/HISTORICAL_MARKET_DATA_PROVIDER/);
  });

  it('5. Pipeline order: Intent classification & gate precedes grounding retrieval and AI provider completion', () => {
    const content = read('apps/api/src/application/ai/send-ai-conversation-message.use-case.ts');
    const classifyIdx = content.indexOf('classifyConversationIntent');
    const groundingIdx = content.indexOf('getGroundingContextUseCase.execute');
    const providerIdx = content.indexOf('aiProvider.complete');

    expect(classifyIdx).toBeGreaterThanOrEqual(0);
    expect(groundingIdx).toBeGreaterThan(classifyIdx);
    expect(providerIdx).toBeGreaterThan(groundingIdx);
    // Verifies unsupported gate returns before grounding
    expect(content).toMatch(/UNSUPPORTED_RECOMMENDATION/);
  });

  it('6. Web client cannot import provider SDK or expose OpenAI keys', () => {
    const webPage = read('apps/web/src/app/(app)/ai/page.tsx');
    expect(webPage).not.toMatch(/from ['"]openai['"]/i);
    expect(webPage).not.toMatch(/OPENAI_API_KEY/);
    expect(webPage).not.toMatch(/process\.env\.OPENAI/);

    const pkg = read('apps/web/package.json');
    expect(pkg).not.toMatch(/['"]openai['"]/i);
  });

  it('7. Mobile client cannot import provider SDK or expose OpenAI keys', () => {
    const mobileScreen = read('apps/mobile/app/(app)/(tabs)/ai.tsx');
    expect(mobileScreen).not.toMatch(/from ['"]openai['"]/i);
    expect(mobileScreen).not.toMatch(/OPENAI_API_KEY/);
    expect(mobileScreen).not.toMatch(/process\.env\.OPENAI/);

    const pkg = read('apps/mobile/package.json');
    expect(pkg).not.toMatch(/['"]openai['"]/i);
  });

  it('8. Conversation client view-model performs zero financial math', () => {
    const vm = read('packages/ui/src/view-models/portfolio-ai-conversation.view-model.ts');
    expect(vm).not.toMatch(/Math\.pow|Math\.sqrt/);
    expect(vm).not.toMatch(/parseFloat/);
    expect(vm).not.toMatch(/Number\(/);
    expect(vm).not.toMatch(/calculateSharpe|calculateBeta|calculateTWR|expectedReturn|covariance/);
  });

  it('9. Strictly NO agentic frameworks, RAG frameworks or vector databases in the entire workspace', () => {
    const rootPkg = read('package.json');
    const prohibitedDeps = [
      'langchain',
      '@langchain',
      'llamaindex',
      'chromadb',
      'pinecone',
      '@pinecone-database',
      'weaviate-ts-client',
      '@qdrant',
    ];

    for (const dep of prohibitedDeps) {
      expect(rootPkg).not.toMatch(new RegExp(`['"]${dep}['"]`));
    }
  });
});
