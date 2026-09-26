# Portfolio AI Asset Scope Contract (v1)

Contract: `PORTFOLIO_AI_ASSET_SCOPE_V1`  
Schema Version: `1`  
Package: `@atlas/ai-engine`  
Phase: `3W`  
Status: `APPROVED`

---

## 1. Overview and Invariants

The **Asset Scope Contract** governs how conversational interactions declare, validate, and isolate asset-level inquiries.

### Invariants:

1. **Explicit Scope Over NLP Guessing**: The system never uses an LLM to guess which asset the user is referring to from conversational text. Inquiries about an asset must carry explicit `scope: { type: 'ASSET', assetId: string }`.
2. **Deterministic Refusal for Missing Scope**: If an asset-oriented question is submitted without an explicit asset scope, the classifier fails closed upstream with `MISSING_ASSET_SCOPE` (0 model calls).
3. **Per-Message Lifespan (No Stale Bleed)**: Scope is evaluated per-message. Prior turns with Asset A do not silently bind subsequent turns if scope is cleared or changed.
4. **Anti-Enumeration Ownership**: The API validates that the scoped `assetId` exists in the authenticated user's portfolio custody. If not owned or non-existent, the API returns a privacy-preserving `404 Not Found`.

---

## 2. Type Definition

```typescript
export interface AssetAiScope {
  readonly type: 'ASSET';
  readonly assetId: string;
  readonly symbol?: string;
  readonly name?: string;
}

export interface PortfolioAiScope {
  readonly type: 'PORTFOLIO';
}

export type AiConversationScope = PortfolioAiScope | AssetAiScope;
```
