import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/**
 * Reads a file with comments stripped, so that documenting a prohibition in a
 * comment does not itself trip the prohibition check.
 */
function readCode(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

const SELECTION = 'packages/ai-engine/src/grounding-selection.ts';
const ENGINE = 'packages/ai-engine/src/index.ts';
const BUDGET = 'apps/api/src/application/ai/context-budget.ts';
const USE_CASES = [
  'apps/api/src/application/ai/send-ai-conversation-message.use-case.ts',
  'apps/api/src/application/ai/stream-ai-conversation-message.use-case.ts',
  'apps/api/src/application/ai/explain-portfolio-with-ai.use-case.ts',
];

describe('Phase 3Y architecture boundaries: deterministic context selection', () => {
  it('selection module is pure: no I/O, no network, no persistence', () => {
    const c = readCode(SELECTION);

    expect(c).not.toMatch(/\bfetch\s*\(/);
    expect(c).not.toMatch(/axios|node-fetch|undici/i);
    expect(c).not.toMatch(/from ['"]node:fs['"]|require\(['"]fs['"]\)/);
    expect(c).not.toMatch(/PrismaClient|@prisma\/client/);
    expect(c).not.toMatch(/@nestjs/);
  });

  it('selection module never imports UI, React or Expo', () => {
    const c = readCode(SELECTION);
    expect(c).not.toMatch(/\breact\b|react-native|\bexpo\b|@atlas\/ui/i);
  });

  it('selection module never calls a model provider, summarizer or embeddings (ADR-226)', () => {
    const c = readCode(SELECTION);

    expect(c).not.toMatch(/openai|anthropic|gemini|cohere|ollama/i);
    expect(c).not.toMatch(/embedding|vectorStore|pinecone|weaviate|qdrant|chromadb/i);
    expect(c).not.toMatch(/\.complete\s*\(/);
    expect(c).not.toMatch(/summariz/i);
  });

  it('selection module performs no financial computation and no new engine calls', () => {
    const c = readCode(SELECTION);

    expect(c).not.toMatch(/replayPortfolio|calculateTWR|calculateXIRR/);
    expect(c).not.toMatch(/calculateSharpe|calculateBeta|calculateVolatility|calculateVaR/);
    expect(c).not.toMatch(/parseFloat|Number\(|Math\.(pow|sqrt|abs|round)/);
    expect(c).not.toMatch(/portfolio-engine|valuation-engine|risk-engine|market-data/);
  });

  it('selection module does not rank relevance by numeric magnitude', () => {
    const c = readCode(SELECTION);

    expect(c).not.toMatch(/value\s*[><]=?\s*\d/);
    expect(c).not.toMatch(/sort\(\s*\(a,\s*b\)\s*=>\s*b\.value/);
  });

  it('selection uses Set/Map membership for linear lookups', () => {
    const c = readCode(SELECTION);
    expect(c).toMatch(/new Set</);
    expect(c).toMatch(/new Map</);
  });

  it('the frozen 32768-byte budget is not raised anywhere', () => {
    const engine = read(ENGINE);
    expect(engine).toContain('AI_DEFAULT_MAX_CONTEXT_BYTES = 32768');
    expect(engine).not.toMatch(/AI_DEFAULT_MAX_CONTEXT_BYTES\s*=\s*(65536|131072|64000|128000)/);
  });

  it('the authoritative budget check measures the exact provider messages array in bytes', () => {
    const c = read(BUDGET);
    expect(c).toMatch(/Buffer\.byteLength\(JSON\.stringify\(messages\), 'utf8'\)/);
    expect(c).not.toMatch(/estimateTokens|tiktoken/i);
  });

  it('every provider call site selects, compacts and measures before calling the provider', () => {
    for (const f of USE_CASES) {
      const c = read(f);

      expect(c, `${f} must use the compact prompt builder`).toContain(
        'buildCompactConversationPrompt',
      );
      expect(c, `${f} must evaluate the budget`).toContain('evaluateProviderContextBudget');

      const budgetIdx = c.indexOf('evaluateProviderContextBudget(messages)');
      const providerIdx = c.indexOf('this.aiProvider.complete');
      expect(budgetIdx, `${f} must evaluate budget`).toBeGreaterThan(-1);
      expect(providerIdx, `${f} must call provider`).toBeGreaterThan(-1);
      expect(budgetIdx, `${f} must measure BEFORE calling the provider`).toBeLessThan(providerIdx);
    }
  });

  it('every provider call site validates against the selected authority, not the full context (ADR-227)', () => {
    for (const f of USE_CASES) {
      const c = readCode(f);

      expect(c, `${f} must build the selected authority`).toContain('authoritativeContext');
      expect(c, `${f} must resolve claim aliases`).toContain('resolveClaimReferences');
      expect(c, `${f} must resolve evidence aliases`).toContain('resolveEvidenceReferences');

      expect(c).not.toMatch(/validateGroundedClaims\(\s*claims,\s*context\b/);
      expect(c).not.toMatch(/validateExplanationEvidence\(\s*evidenceFactIds,\s*context\b/);
    }
  });

  it('no provider call site introduces a second model call for selection', () => {
    for (const f of USE_CASES) {
      const c = readCode(f);
      const calls = c.match(/this\.aiProvider\.complete/g) ?? [];
      expect(calls.length, `${f} must have exactly one provider call site`).toBe(1);
    }
  });

  it('no RAG, embeddings, vector database or web browsing anywhere in the AI layer', () => {
    for (const f of [SELECTION, ENGINE, ...USE_CASES]) {
      const c = readCode(f);
      expect(c, `${f} must not use embeddings`).not.toMatch(
        /embeddings?\.create|vectorStore|pinecone|weaviate|qdrant|chromadb|faiss/i,
      );
      expect(c, `${f} must not use web browsing`).not.toMatch(
        /web_search|browsing|puppeteer|playwright/i,
      );
    }
  });

  it('selection telemetry carries no financial values and no high-cardinality labels', () => {
    const engine = readCode(ENGINE);
    const labelFn = engine.slice(engine.indexOf('export function extractSafeMetricLabels'));
    const body = labelFn.slice(0, labelFn.indexOf('\n}'));

    expect(body).not.toMatch(/factId|assetId|portfolioId|conversationId|userId|requestId/);
    expect(body).not.toMatch(/contextBytes/);
    expect(body).toContain('budgetUtilizationBucket');
    expect(body).toContain('selectionPolicyVersion');
  });

  it('selection policy version is independent of the Portfolio Engine version', () => {
    const c = read(SELECTION);
    expect(c).toContain("GROUNDING_SELECTION_POLICY_VERSION = '1'");
    expect(c).not.toMatch(/1\.0\.0-rc\.1|PORTFOLIO_ENGINE_VERSION/);
  });

  it('raw ledger and Prisma types never reach the selection or projection layer', () => {
    const c = readCode(SELECTION);
    expect(c).not.toMatch(/Transaction\[\]|ITransactionRepository|prisma/i);
  });
});
