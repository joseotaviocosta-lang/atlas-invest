// ---------------------------------------------------------------------------
// Phase 3Y — Deterministic Grounding Context Efficiency & Relevance Selection
//
// ADR-222: Intent/scope deterministically choose relevant fact families.
// ADR-223: Canonical grounding remains rich; provider projection may be compact.
// ADR-224: Request-local evidence aliases map to canonical fact IDs.
// ADR-225: Final exact provider payload remains subject to the 32768-byte gate.
// ADR-226: No LLM summarizer, embeddings, or additional model call.
// ADR-227: Excluded facts cannot be used for authoritative claims.
//
// Pure, deterministic, zero I/O. Operates ONLY on grounding already constructed:
// no replay, no valuation, no market fetch, no financial recalculation.
// ---------------------------------------------------------------------------

import type {
  AiConversationScope,
  ExplanationIntent,
  GroundedFactCategory,
  GroundedFinancialFact,
  GroundedLimitation,
  PortfolioAiEventV1,
  PortfolioAiGroundingContextV1,
  PortfolioAssetAiGroundingContextV1,
  PortfolioTimelineAiGroundingContextV1,
} from './index';

export const GROUNDING_SELECTION_POLICY_VERSION = '1' as const;

/**
 * Categories that are ALWAYS required regardless of intent. These carry the
 * interpretive frame (identity, availability, period) without which no
 * authoritative claim can be safely validated.
 */
const BASE_REQUIRED_CATEGORIES: readonly GroundedFactCategory[] = Object.freeze(['OVERVIEW']);

/**
 * Deterministic intent -> fact family map (ADR-222).
 *
 * Only the families semantically required by the active intent are selected.
 * Unknown/unsupported intents fall back to the broader safe subset (§79/§80).
 */
const INTENT_CATEGORY_FAMILIES: Readonly<
  Partial<Record<ExplanationIntent, readonly GroundedFactCategory[]>>
> = Object.freeze({
  EXPLAIN_PORTFOLIO: Object.freeze([
    'OVERVIEW',
    'PERFORMANCE',
    'BENCHMARK',
    'ASSET_ALLOCATION',
  ] as const),
  EXPLAIN_PERFORMANCE: Object.freeze([
    'OVERVIEW',
    'PERFORMANCE',
    'BENCHMARK',
    'ACTIVE_PERFORMANCE',
  ] as const),
  EXPLAIN_BENCHMARK: Object.freeze([
    'OVERVIEW',
    'PERFORMANCE',
    'BENCHMARK',
    'RELATIVE_RISK',
    'ACTIVE_PERFORMANCE',
  ] as const),
  EXPLAIN_RISK: Object.freeze([
    'OVERVIEW',
    'RISK',
    'RISK_ADJUSTED',
    'RELATIVE_RISK',
    'TAIL_RISK',
  ] as const),
  EXPLAIN_SCENARIO: Object.freeze(['OVERVIEW', 'SCENARIO'] as const),
  EXPLAIN_DATA_QUALITY: Object.freeze(['OVERVIEW'] as const),
  EXPLAIN_ASSET: Object.freeze([
    'OVERVIEW',
    'ASSET_IDENTITY',
    'ASSET_POSITION',
    'ASSET_INCOME',
    'ASSET_REALIZED',
    'ASSET_ALLOCATION',
  ] as const),
  EXPLAIN_TIMELINE: Object.freeze([
    'OVERVIEW',
    'TIMELINE_EVENT',
    'EVENT_TRANSACTION',
    'EVENT_INCOME',
    'EVENT_CORPORATE_ACTION',
  ] as const),
});

/**
 * Safe bounded fallback when intent cannot be mapped to a family (§79/§80).
 * Deliberately broad rather than aggressive guessing.
 */
const FALLBACK_CATEGORIES: readonly GroundedFactCategory[] = Object.freeze([
  'OVERVIEW',
  'PERFORMANCE',
  'BENCHMARK',
  'RISK',
  'RISK_ADJUSTED',
  'RELATIVE_RISK',
  'ACTIVE_PERFORMANCE',
  'TAIL_RISK',
  'SCENARIO',
  'ASSET_IDENTITY',
  'ASSET_POSITION',
  'ASSET_INCOME',
  'ASSET_REALIZED',
  'ASSET_ALLOCATION',
  'TIMELINE_EVENT',
  'EVENT_TRANSACTION',
  'EVENT_INCOME',
  'EVENT_CORPORATE_ACTION',
]);

export type GroundingAnswerability = 'ANSWERABLE' | 'LIMITED' | 'UNAVAILABLE';

export interface GroundingSelectionManifestV1 {
  readonly policyVersion: typeof GROUNDING_SELECTION_POLICY_VERSION;
  readonly intent: ExplanationIntent;
  readonly scopeType: string;
  readonly availableFactCount: number;
  readonly selectedFactCount: number;
  readonly excludedFactCount: number;
  readonly selectedCategories: readonly GroundedFactCategory[];
  readonly excludedCategories: readonly GroundedFactCategory[];
  readonly usedFallback: boolean;
  readonly answerability: GroundingAnswerability;
}

export interface GroundingSelectionResultV1 {
  /** Canonical authoritative registry for the turn: ONLY selected facts (ADR-227). */
  readonly canonicalFactRegistry: ReadonlyMap<string, GroundedFinancialFact>;
  readonly selectedFacts: readonly GroundedFinancialFact[];
  readonly manifest: GroundingSelectionManifestV1;
}

function scopeTypeOf(context: { readonly scope?: AiConversationScope }): string {
  return context.scope?.type ?? 'PORTFOLIO';
}

function scopeOf(context: unknown): AiConversationScope | undefined {
  const s = (context as { scope?: AiConversationScope }).scope;
  return s;
}

/**
 * Deterministic, query-aware (NOT model-aware) grounding fact selection.
 *
 * Inputs are strictly: deterministic classified intent, explicit scope, and the
 * canonical facts already built. No provider output, no embeddings, no ranking
 * by numeric magnitude (§22, §100).
 */
export function selectGroundingFacts(params: {
  readonly context:
    | PortfolioAiGroundingContextV1
    | PortfolioAssetAiGroundingContextV1
    | PortfolioTimelineAiGroundingContextV1;
  readonly intent: ExplanationIntent;
}): GroundingSelectionResultV1 {
  const { context, intent } = params;
  const available = context.facts;

  const mapped = INTENT_CATEGORY_FAMILIES[intent];
  const usedFallback = mapped === undefined;
  const familyCategories = mapped ?? FALLBACK_CATEGORIES;

  const allowed = new Set<GroundedFactCategory>(familyCategories);
  for (const c of BASE_REQUIRED_CATEGORIES) allowed.add(c);

  const scopeType = scopeTypeOf({ scope: scopeOf(context) });

  // Asset scope isolation: when the turn is scoped to one asset, facts belonging
  // to a different asset are never selected (preserves 3W cross-asset rules).
  const targetAssetId =
    scopeType === 'ASSET' || scopeType === 'ASSET_TIMELINE'
      ? (scopeOf(context) as { assetId?: string } | undefined)?.assetId
      : undefined;

  const selectedFacts: GroundedFinancialFact[] = [];
  const registry = new Map<string, GroundedFinancialFact>();
  const seenFactIds = new Set<string>();
  const selectedCategories = new Set<GroundedFactCategory>();
  const excludedCategories = new Set<GroundedFactCategory>();

  // Single O(n) pass preserving canonical input ordering (§23, §98).
  for (const fact of available) {
    if (!allowed.has(fact.category)) {
      excludedCategories.add(fact.category);
      continue;
    }
    if (
      targetAssetId !== undefined &&
      fact.assetId !== undefined &&
      fact.assetId !== targetAssetId
    ) {
      excludedCategories.add(fact.category);
      continue;
    }
    if (seenFactIds.has(fact.factId)) continue; // canonical deduplication
    seenFactIds.add(fact.factId);
    selectedFacts.push(fact);
    registry.set(fact.factId, fact);
    selectedCategories.add(fact.category);
  }

  const answerability: GroundingAnswerability =
    selectedFacts.length === 0
      ? 'UNAVAILABLE'
      : context.limitations.length > 0
        ? 'LIMITED'
        : 'ANSWERABLE';

  const manifest: GroundingSelectionManifestV1 = Object.freeze({
    policyVersion: GROUNDING_SELECTION_POLICY_VERSION,
    intent,
    scopeType,
    availableFactCount: available.length,
    selectedFactCount: selectedFacts.length,
    excludedFactCount: available.length - selectedFacts.length,
    selectedCategories: Object.freeze([...selectedCategories].sort()),
    excludedCategories: Object.freeze([...excludedCategories].sort()),
    usedFallback,
    answerability,
  });

  return Object.freeze({
    canonicalFactRegistry: registry,
    selectedFacts: Object.freeze(selectedFacts),
    manifest,
  });
}

// ---------------------------------------------------------------------------
// Provider projection (ADR-223)
// ---------------------------------------------------------------------------

export const EVIDENCE_ALIAS_PREFIX = 'F' as const;

export interface ProviderEvidenceAliasMapV1 {
  /** alias (e.g. "F1") -> canonical factId */
  readonly aliasToFactId: ReadonlyMap<string, string>;
  /** canonical factId -> alias */
  readonly factIdToAlias: ReadonlyMap<string, string>;
}

interface CompactFactRow {
  ref: string;
  m: string; // metric
  v: string | null; // exact decimal / enum string, or null when unavailable (unknown != zero)
  u: string; // unit
  s: string; // scope
  c: string; // category
  n: string; // nature (CURRENT / HISTORICAL / HYPOTHETICAL) — never dropped
  st: string; // status (availability; unknown != zero)
  cur?: string; // currency — never dropped where present
  a?: string; // asset reference key
  p?: { s: string; e: string }; // period, only when not degenerate
  ao?: string; // asOf, only when it adds information
}

interface CompactEventRow {
  ref?: string;
  id: string;
  d: string; // economic date
  t: string; // event type — BUY != TRANSFER, DIVIDEND != JCP
  a?: string; // asset dictionary key
  q?: string; // exact quantity string
  amt?: string; // exact money string
  cur?: string;
}

export interface ProviderProjectionV1 {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly aliases: ProviderEvidenceAliasMapV1;
}

/**
 * Builds the compact, provider-facing projection of the SELECTED canonical facts.
 *
 * Compaction rules (all value-preserving):
 * - shared asset metadata is hoisted into an asset dictionary (§24);
 * - event metadata is carried once in a compact envelope instead of being
 *   repeated across six atomic fact objects (§25, §26);
 * - internal validator metadata (source paths) is omitted (§28);
 * - long canonical fact IDs are replaced by request-local aliases (§30, §31);
 * - degenerate single-day periods are omitted because asOf carries the same day.
 *
 * NEVER mutated: decimal strings, currency, nature, status, event type, scope.
 */
export function buildProviderProjection(params: {
  readonly context:
    | PortfolioAiGroundingContextV1
    | PortfolioAssetAiGroundingContextV1
    | PortfolioTimelineAiGroundingContextV1;
  readonly selection: GroundingSelectionResultV1;
  readonly question: string;
  readonly intent: ExplanationIntent;
}): ProviderProjectionV1 {
  const { context, selection, question, intent } = params;

  const aliasToFactId = new Map<string, string>();
  const factIdToAlias = new Map<string, string>();
  let aliasCounter = 0;
  const aliasFor = (factId: string): string => {
    const existing = factIdToAlias.get(factId);
    if (existing !== undefined) return existing;
    aliasCounter += 1;
    const alias = `${EVIDENCE_ALIAS_PREFIX}${aliasCounter}`;
    factIdToAlias.set(factId, alias);
    aliasToFactId.set(alias, factId);
    return alias;
  };

  // Asset dictionary (deterministic insertion order over selected facts/events).
  const assetKeyByAssetId = new Map<string, string>();
  const assetDictionary: Record<string, Record<string, string>> = {};
  const events: readonly PortfolioAiEventV1[] =
    'events' in context && context.events ? context.events : [];
  const eventMetaByAssetId = new Map<string, { symbol?: string; name?: string }>();
  for (const e of events) {
    if (e.assetId !== undefined && !eventMetaByAssetId.has(e.assetId)) {
      eventMetaByAssetId.set(e.assetId, { symbol: e.symbol, name: e.assetName });
    }
  }
  const assetKeyFor = (assetId: string): string => {
    const existing = assetKeyByAssetId.get(assetId);
    if (existing !== undefined) return existing;
    const key = `A${assetKeyByAssetId.size + 1}`;
    assetKeyByAssetId.set(assetId, key);
    const meta = eventMetaByAssetId.get(assetId);
    const entry: Record<string, string> = { assetId };
    if (meta?.symbol !== undefined) entry.symbol = meta.symbol;
    if (meta?.name !== undefined) entry.name = meta.name;
    assetDictionary[key] = entry;
    return key;
  };

  // Event facts are represented by the compact envelope; their canonical fact
  // IDs are still exposed as aliases so the provider can cite them.
  const eventFactIds = new Set<string>();
  const compactFacts: CompactFactRow[] = [];

  for (const fact of selection.selectedFacts) {
    if (fact.factId.startsWith('EVENT:')) {
      eventFactIds.add(fact.factId);
      continue; // carried by the event envelope below
    }
    const row: CompactFactRow = {
      ref: aliasFor(fact.factId),
      m: fact.metric,
      v: fact.value,
      u: fact.unit,
      s: fact.scope,
      c: fact.category,
      n: fact.nature,
      st: fact.status,
    };
    if (fact.currency !== undefined) row.cur = fact.currency;
    if (fact.assetId !== undefined) row.a = assetKeyFor(fact.assetId);
    const degeneratePeriod =
      fact.period !== undefined &&
      fact.period.startDate === fact.period.endDate &&
      fact.period.startDate === fact.asOf;
    if (fact.period !== undefined && !degeneratePeriod) {
      row.p = { s: fact.period.startDate, e: fact.period.endDate };
    }
    if (fact.asOf !== undefined) row.ao = fact.asOf;
    compactFacts.push(row);
  }

  // Compact event envelope carrying each event's data ONCE, with per-field
  // aliases so claims about events remain citable and validatable.
  const compactEvents: CompactEventRow[] = [];
  for (const e of events) {
    const fieldRefs: Record<string, string> = {};
    const register = (suffix: string, key: string) => {
      const canonical = `EVENT:${e.eventId}.${suffix}`;
      if (eventFactIds.has(canonical)) fieldRefs[key] = aliasFor(canonical);
    };
    register('TYPE', 't');
    register('DATE', 'd');
    register('ASSET_ID', 'a');
    register('QUANTITY', 'q');
    register('AMOUNT', 'amt');
    register('CURRENCY', 'cur');

    if (Object.keys(fieldRefs).length === 0) continue;

    const row: CompactEventRow = {
      id: e.eventId,
      d: e.economicDate,
      t: e.eventType,
    };
    if (e.assetId !== undefined) row.a = assetKeyFor(e.assetId);
    if (e.quantity !== undefined) row.q = e.quantity;
    if (e.moneyAmount !== undefined) row.amt = e.moneyAmount;
    if (e.currency !== undefined) row.cur = e.currency;
    (row as unknown as Record<string, unknown>).refs = fieldRefs;
    compactEvents.push(row);
  }

  const limitations: readonly GroundedLimitation[] = context.limitations;

  const payload: Record<string, unknown> = {
    question,
    intent,
    policyVersion: GROUNDING_SELECTION_POLICY_VERSION,
    portfolioId: context.portfolioId,
    scope:
      'scope' in context && context.scope
        ? (context.scope as AiConversationScope)
        : { type: 'PORTFOLIO' as const },
    period:
      'analysisPeriod' in context && context.analysisPeriod
        ? { s: context.analysisPeriod.startDate, e: context.analysisPeriod.endDate }
        : 'period' in context
          ? { s: context.period.from, e: context.period.to }
          : undefined,
    asOf: context.asOf,
    currencies: context.currencies,
    answerability: selection.manifest.answerability,
    facts: compactFacts,
  };

  if (Object.keys(assetDictionary).length > 0) payload.assets = assetDictionary;
  if (compactEvents.length > 0) payload.events = compactEvents;
  if ('summaryFacts' in context && context.summaryFacts) {
    payload.timeline = {
      n: context.summaryFacts.eventCountIncluded,
      hasMore: context.summaryFacts.hasMore,
    };
  }
  if ('dataQuality' in context && context.dataQuality) {
    payload.dataQuality = {
      status: context.dataQuality.status,
      availability: context.dataQuality.availability,
    };
  }
  // Limitations required for interpretation are never dropped for byte savings (§85).
  payload.limitations = limitations;

  return Object.freeze({
    payload: Object.freeze(payload),
    aliases: Object.freeze({
      aliasToFactId,
      factIdToAlias,
    }),
  });
}

/**
 * Resolves provider-returned evidence references (aliases OR canonical fact IDs)
 * back to canonical fact IDs before claim validation (§31, §35).
 *
 * Unknown references are returned untouched so downstream fail-closed validation
 * rejects them; this function never invents a canonical identity.
 */
export function resolveEvidenceReference(
  reference: string,
  aliases: ProviderEvidenceAliasMapV1,
): string {
  return aliases.aliasToFactId.get(reference) ?? reference;
}

// ---------------------------------------------------------------------------
// Alias-aware claim/evidence resolution (ADR-224, §31, §35)
// ---------------------------------------------------------------------------

/**
 * Addendum appended to the canonical conversation policy describing the compact
 * context format. It ADDS format guidance only; it never removes or weakens any
 * safety directive (§51).
 */
export const COMPACT_CONTEXT_FORMAT_ADDENDUM = `
FORMATO COMPACTO DO CONTEXTO (apenas estrutura; as regras acima permanecem integrais):
- 'facts' traz um fato por linha com chaves abreviadas: ref (identificador da evidência), m (métrica), v (valor exato como string), u (unidade), s (escopo), c (categoria), n (natureza: CURRENT/HISTORICAL/HYPOTHETICAL), st (disponibilidade), cur (moeda), a (chave do ativo em 'assets'), p (período), ao (data de referência).
- 'assets' é um dicionário de ativos; 'a' referencia uma entrada dele. A identidade canônica do ativo é sempre 'assetId'.
- 'events' traz um evento por linha: id, d (data econômica), t (tipo), a (ativo), q (quantidade exata), amt (valor monetário exato), cur (moeda) e 'refs' com o identificador de evidência de cada campo.
- CITAÇÃO DE EVIDÊNCIA: cite SEMPRE o valor de 'ref' (ex.: "F1") ou de 'refs' em 'evidenceFactIds' e nos segmentos de claims. Somente identificadores presentes neste contexto são válidos.
- O contexto contém APENAS os fatos relevantes para esta pergunta. Se um dado necessário não estiver presente, declare que não está disponível — NUNCA estime, calcule ou invente.
- Valores são strings decimais exatas. NUNCA arredonde, reformate ou converta moedas.`;

interface ClaimSegmentLike {
  readonly type: string;
  readonly factId?: string;
  readonly text?: string;
  readonly role?: string;
}

interface ClaimLike {
  readonly claimId?: string;
  readonly type: string;
  readonly segments: readonly ClaimSegmentLike[];
  readonly factIds?: readonly string[];
}

/**
 * Rewrites provider-returned evidence references (request-local aliases) into
 * canonical fact IDs so that downstream validation and historical persistence
 * always operate on canonical identity (§34).
 */
export function resolveClaimReferences<T extends ClaimLike>(
  claims: readonly T[],
  aliases: ProviderEvidenceAliasMapV1,
): T[] {
  return claims.map((claim) => {
    const segments = claim.segments.map((seg) =>
      seg.factId === undefined
        ? seg
        : { ...seg, factId: resolveEvidenceReference(seg.factId, aliases) },
    );
    const factIds = claim.factIds?.map((id) => resolveEvidenceReference(id, aliases));
    return {
      ...claim,
      segments,
      ...(factIds !== undefined ? { factIds } : {}),
    } as T;
  });
}

/**
 * Resolves a list of provider evidence references into canonical fact IDs.
 */
export function resolveEvidenceReferences(
  references: readonly string[],
  aliases: ProviderEvidenceAliasMapV1,
): string[] {
  return references.map((r) => resolveEvidenceReference(r, aliases));
}
