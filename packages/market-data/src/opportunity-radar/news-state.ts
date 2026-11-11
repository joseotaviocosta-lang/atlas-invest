/**
 * Project Atlas — Portfolio News State & New Event Detection Engine (APP-16M)
 *
 * Pure deterministic state overlay tracking per-portfolio event lifecycle:
 *   - NEW: Unseen event appeared after portfolio news baseline initialization
 *   - UPDATED: Previously observed event underwent a material/official/semantic version change
 *   - SEEN: Explicitly viewed/acknowledged by the investor
 *   - UNCHANGED: Baseline historical event (or stable untouched non-novel event)
 *
 * Core Invariants:
 * 1. Strictly pure & deterministic with injectable clock (`referenceDate`).
 * 2. Portfolio-scoped (isolated per portfolioId; never global by ticker).
 * 3. Baseline initialization (`newsStateInitializedAt`) prevents initial flood of false NEW alerts.
 * 4. `eventVersionFingerprint` ignores volatile `updatedAt`, source array order, URL tracking params,
 *    and redundant media re-reporting that adds no material, official, or sentiment delta.
 * 5. Never alters `News Score V2`, `Opportunity Score`, `materiality`, or `sentiment`.
 */

import * as crypto from 'node:crypto';
import type {
  NewsEventType,
  NewsEventUpdateReason,
  NewsImportance,
  NewsMateriality,
  NewsSentiment,
  PortfolioNewsEvent,
  PortfolioNewsEventStateType,
  PortfolioNewsStateSummary,
} from './portfolio-news.types.js';
import { normalizeHeadlineForMatch, stripPublisherTail } from './news-canonicalizer.js';

export interface PersistedPortfolioNewsEventMeta {
  official?: boolean;
  eventType?: NewsEventType;
  materiality?: NewsMateriality;
  importance?: NewsImportance;
  sentiment?: NewsSentiment;
  officialSourceUrls?: string[];
  allSourceUrls?: string[];
  tickers?: string[];
  headlineCore?: string;
  // Typed APP-16N local alert tracking (persisted in snapshot_meta JSONB; MIGRATION_REQUIRED = NO)
  alertBaselineVersionSuppressed?: string | null;
  alertBaselineRecordedAt?: string | null;
  alertedVersionFingerprint?: string | null;
  alertedAt?: string | null;
  alertClaimedFingerprint?: string | null;
  alertClaimExpiresAt?: string | null;
}

export interface PersistedPortfolioNewsEventState {
  portfolioId: string;
  canonicalEventId: string;
  firstSeenAt: string;
  lastObservedAt: string;
  lastSeenByUserAt: string | null;
  firstFingerprint: string;
  latestFingerprint: string;
  state: PortfolioNewsEventStateType;
  latestUpdateReasons: NewsEventUpdateReason[];
  eventPublishedAt: string | null;
  meta?: PersistedPortfolioNewsEventMeta;
}

export interface PersistedPortfolioNewsSyncState {
  portfolioId: string;
  newsStateInitializedAt: string | null;
  lastRefreshedAt: string | null;
}

export interface StateTransitionUpsertItem {
  portfolioId: string;
  canonicalEventId: string;
  previousCanonicalEventId?: string;
  firstSeenAt: string;
  lastObservedAt: string;
  lastSeenByUserAt: string | null;
  firstFingerprint: string;
  latestFingerprint: string;
  state: PortfolioNewsEventStateType;
  latestUpdateReasons: NewsEventUpdateReason[];
  eventPublishedAt: string | null;
  meta: PersistedPortfolioNewsEventMeta;
}

export interface ApplyPortfolioNewsStateResult {
  events: PortfolioNewsEvent[];
  summary: PortfolioNewsStateSummary;
  syncStateToPersist: PersistedPortfolioNewsSyncState;
  statesToUpsert: StateTransitionUpsertItem[];
  newlyDetectedEvents: PortfolioNewsEvent[];
  updatedDetectedEvents: PortfolioNewsEvent[];
}

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'oc',
  'rss',
]);

/**
 * Deterministically normalizes a news or regulatory document URL, stripping volatile tracking parameters
 * while preserving functional regulatory parameters (CVM NumeroProtocoloEntrega, B3 FNET id, etc.).
 */
export function normalizeNewsSourceUrl(rawUrl?: string | null): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const paramsToDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        paramsToDelete.push(key);
      }
    });
    for (const k of paramsToDelete) {
      parsed.searchParams.delete(k);
    }

    // Sort remaining query parameters canonically
    const sortedEntries = Array.from(parsed.searchParams.entries()).sort((a, b) => {
      const kDiff = a[0].localeCompare(b[0]);
      return kDiff !== 0 ? kDiff : a[1].localeCompare(b[1]);
    });
    parsed.search = '';
    for (const [k, v] of sortedEntries) {
      parsed.searchParams.append(k, v);
    }

    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function isOfficialSourceRef(name: string, normalizedUrl: string): boolean {
  const upperName = name.toUpperCase().trim();
  if (
    upperName === 'CVM' ||
    upperName === 'B3' ||
    upperName === 'B3 / FNET' ||
    upperName === 'FNET' ||
    upperName === 'RI' ||
    upperName.includes('OFICIAL')
  ) {
    return true;
  }
  const lowerUrl = normalizedUrl.toLowerCase();
  return (
    lowerUrl.includes('rad.cvm.gov.br') ||
    lowerUrl.includes('dados.cvm.gov.br') ||
    lowerUrl.includes('fnet.bmfbovespa.com.br') ||
    lowerUrl.includes('b3.com.br')
  );
}

function extractMaterialHeadlineTokens(headline: string): string {
  const stripped = stripPublisherTail(headline || '');
  const norm = normalizeHeadlineForMatch(stripped);
  // Extract core alphanumeric tokens (>= 3 chars or numeric values) in canonical sorted order
  // Wait: preserve significant words sorted? Actually normalizeHeadlineForMatch already removes accents & punctuation.
  return norm.trim();
}

function extractNumericTokens(text: string): string[] {
  const matches = (text || '').match(/\d+(?:[.,]\d+)?/g);
  if (!matches) return [];
  return Array.from(new Set(matches)).sort();
}

function hasMaterialTextRevision(prevHeadlineCore: string | undefined, nextHeadlineCore: string, prevText: string, nextText: string): boolean {
  if (!prevHeadlineCore) return false;
  if (prevHeadlineCore === nextHeadlineCore) return false;

  // Check if explicit revision/rectification keyword appeared
  if (/\b(retifica|aditamento|errata|republica|substitutiv|nova versao|novo valor|atualiza)\b/i.test(nextHeadlineCore) &&
      !/\b(retifica|aditamento|errata|republica|substitutiv|nova versao|novo valor|atualiza)\b/i.test(prevHeadlineCore)) {
    return true;
  }

  // Check numeric figure shifts (e.g. "R$ 15 bi" -> "R$ 20 bi")
  const prevNums = extractNumericTokens(prevText);
  const nextNums = extractNumericTokens(nextText);
  if (nextNums.length > 0 && nextNums.some((n) => !prevNums.includes(n))) {
    return true;
  }

  // Substantial semantic divergence in tokens (< 0.45 Jaccard similarity)
  const setA = new Set(prevHeadlineCore.split(/\s+/).filter((t) => t.length > 2));
  const setB = new Set(nextHeadlineCore.split(/\s+/).filter((t) => t.length > 2));
  if (setA.size === 0 || setB.size === 0) return prevHeadlineCore !== nextHeadlineCore;

  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) inter++;
  }
  const union = setA.size + setB.size - inter;
  const sim = union === 0 ? 1 : inter / union;
  return sim < 0.45;
}

function extractNormalizedUrls(event: PortfolioNewsEvent): {
  officialUrls: string[];
  allUrls: string[];
} {
  const officialSet = new Set<string>();
  const allSet = new Set<string>();

  for (const src of event.sources || []) {
    const normUrl = normalizeNewsSourceUrl(src.url);
    const key = normUrl || `src:${(src.name || 'UNKNOWN').trim().toLowerCase()}`;
    allSet.add(key);

    if (normUrl && (isOfficialSourceRef(src.name || '', normUrl) || event.official)) {
      if (isOfficialSourceRef(src.name || '', normUrl)) {
        officialSet.add(normUrl);
      }
    }
  }

  return {
    officialUrls: Array.from(officialSet).sort(),
    allUrls: Array.from(allSet).sort(),
  };
}

/**
 * Computes a deterministic SHA-256 semantic fingerprint for an event version.
 *
 * Designed specifically so that:
 * - Volatile fields (`updatedAt`, source `publishedAt`, array ordering, URL tracking params) are IGNORED.
 * - Redundant media mirrors echoing an existing un-official event without official confirmation,
 *   materiality change, sentiment change, or substantive info expansion produce the SAME fingerprint.
 * - Official source upgrades (`official: false -> true`, or new CVM/FNET protocol URL), materiality shifts,
 *   sentiment shifts, eventType shifts, and document revisions ALWAYS change the fingerprint.
 */
export function computeEventVersionFingerprint(event: PortfolioNewsEvent): string {
  const { officialUrls } = extractNormalizedUrls(event);
  const headlineCore = extractMaterialHeadlineTokens(event.headline);
  const nums = extractNumericTokens(`${event.headline} ${event.summary || ''}`);
  const revisionFlag = /\b(retifica|aditamento|errata|republica|substitutiv|nova versao)\b/i.test(
    normalizeHeadlineForMatch(`${event.headline} ${event.summary || ''}`),
  );

  // Use sorted primary/all tickers to ensure asset-linking changes are reflected deterministically
  const primaryTickers = Array.from(new Set((event.primaryTickers || []).map((t) => t.toUpperCase().trim()))).sort();
  const assets = Array.from(new Set((event.assets || []).map((t) => t.toUpperCase().trim()))).sort();

  // Note: For official events, specific regulatory document URLs identify distinct official filings/versions
  // (`rad.cvm.gov.br?...Protocolo=1` vs `Protocolo=2`). Non-official redundant media mirror URLs and
  // volatile timestamps (`updatedAt`, source `publishedAt`) are excluded so mirror re-posts don't spam UPDATED.
  const payload = {
    v: 1,
    eventType: event.eventType,
    official: Boolean(event.official),
    sourceType: event.official ? event.sourceType : 'NON_OFFICIAL',
    materiality: event.materiality ?? 'MEDIUM',
    importance: event.importance,
    sentiment: event.sentiment,
    primaryTickers,
    assets,
    officialDocumentUrls: officialUrls,
    revisionFlag,
    numericSignature: nums,
    headlineAnchor: headlineCore,
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Derives structured reasons explaining why a previously known event transitioned to UPDATED.
 */
export function deriveEventUpdateReasons(
  prev: PersistedPortfolioNewsEventState,
  nextEvent: PortfolioNewsEvent,
): NewsEventUpdateReason[] {
  const reasons = new Set<NewsEventUpdateReason>();
  const meta = prev.meta || {};
  const { officialUrls } = extractNormalizedUrls(nextEvent);

  if (meta.official === false && nextEvent.official === true) {
    reasons.add('OFFICIAL_SOURCE_ADDED');
  }

  const prevMateriality = meta.materiality;
  const nextMateriality = nextEvent.materiality ?? 'MEDIUM';
  if (prevMateriality && prevMateriality !== nextMateriality) {
    reasons.add('MATERIALITY_CHANGED');
  }

  if (meta.sentiment && meta.sentiment !== nextEvent.sentiment) {
    reasons.add('SENTIMENT_CHANGED');
  }

  const prevOfficialUrls = meta.officialSourceUrls || [];
  const hasNewOfficialDoc = officialUrls.some((u) => !prevOfficialUrls.includes(u));
  if (hasNewOfficialDoc && meta.official === true) {
    reasons.add('NEW_DOCUMENT_VERSION');
  } else if (hasNewOfficialDoc && meta.official === undefined && nextEvent.official) {
    reasons.add('OFFICIAL_SOURCE_ADDED');
  }

  const prevTickers = meta.tickers || [];
  const nextTickers = Array.from(new Set((nextEvent.assets || []).map((t) => t.toUpperCase().trim()))).sort();
  const hasNewTicker = prevTickers.length > 0 && nextTickers.some((t) => !prevTickers.includes(t));

  const nextHeadlineCore = extractMaterialHeadlineTokens(nextEvent.headline);
  if (
    hasNewTicker ||
    hasMaterialTextRevision(
      meta.headlineCore,
      nextHeadlineCore,
      meta.headlineCore || '',
      `${nextEvent.headline} ${nextEvent.summary || ''}`,
    )
  ) {
    if (
      /\b(retifica|aditamento|errata|republica|substitutiv)\b/i.test(nextHeadlineCore)
    ) {
      reasons.add('NEW_DOCUMENT_VERSION');
    } else {
      reasons.add('NEW_MATERIAL_INFORMATION');
    }
  }

  if (reasons.size === 0) {
    reasons.add('SOURCE_SET_CHANGED');
  }

  return Array.from(reasons);
}

/**
 * Explicit publication proximity window (48 hours) used for safe cross-refresh semantic identity matching.
 */
export const CROSS_REFRESH_IDENTITY_WINDOW_MS = 48 * 60 * 60 * 1000;

const SEMANTIC_BOILERPLATE_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'e', 'em', 'de', 'da', 'do', 'das', 'dos',
  'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'sem', 'sobre', 'entre',
  'que', 'se', 'um', 'uma', 'uns', 'umas', 'ao', 'aos', 'seu', 'sua', 'seus', 'suas',
  'the', 'and', 'for', 'of', 'to', 'in', 'on', 'with',
  'empresa', 'companhia', 'mercado', 'acoes', 'acao', 'cotas', 'cota',
  'comunicado', 'relevante', 'fato', 'aviso', 'acionistas', 'cotistas',
  'cvm', 'fnet', 'b3', 'oficial', 'informa', 'anuncia', 'divulga',
]);

const GENERIC_COMPATIBLE_EVENT_TYPES = new Set<NewsEventType>([
  'FACT_RELEVANT',
  'MARKET_NOTICE',
  'OTHER',
]);

function normalizeNumericString(raw: string): string {
  const dotted = raw.replace(/,/g, '.');
  const [intPart, decPart] = dotted.split('.');
  const cleanInt = (intPart || '0').replace(/^0+(?=\d)/, '') || '0';
  if (!decPart) return cleanInt;
  const cleanDec = decPart.replace(/0+$/, '');
  return cleanDec.length > 0 ? `${cleanInt}.${cleanDec}` : cleanInt;
}

function stripTickerSymbolsFromNormalizedText(normText: string, tickers: string[]): string {
  let result = ` ${normText} `;
  for (const rawTicker of tickers) {
    const t = rawTicker.toLowerCase().trim();
    if (!t) continue;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function extractSemanticMaterialTokens(normHeadline: string, tickers: string[]): Set<string> {
  const withoutTickers = stripTickerSymbolsFromNormalizedText(normHeadline, tickers);
  const tokens = withoutTickers
    .split(/\s+/)
    .map((t) => canonicalizeSemanticToken(t.trim()))
    .filter((t) => {
      if (!t) return false;
      if (SEMANTIC_BOILERPLATE_STOPWORDS.has(t) || EXTRA_SEMANTIC_FILLER_WORDS.has(t)) return false;
      return t.length >= 3 || /\d/.test(t);
    });
  return new Set(tokens);
}

const EXTRA_SEMANTIC_FILLER_WORDS = new Set([
  'anuncia',
  'comunica',
  'informa',
  'divulga',
  'realiza',
  'destaca',
  'revela',
  'aponta',
  'mostra',
  'veja',
  'saiba',
  'confira',
  'para',
  'sobre',
  'como',
  'entre',
  'apos',
  'ante',
  'ate',
  'pelo',
  'pela',
  'pelos',
  'pelas',
  'nos',
  'nas',
  'dos',
  'das',
  'aos',
  'uma',
  'uns',
  'umas',
  'novo',
  'nova',
  'programa',
]);

function canonicalizeSemanticToken(token: string): string {
  if (!token) return '';
  if (/^aprov(?:a|ou|am|ar|ado|ada|ados|adas|acao|acoes)$/.test(token)) return 'aprova';
  if (/^pag(?:a|ou|am|ar|amento|amentos)$/.test(token)) return 'pagamento';
  if (/^distribu(?:i|iu|em|ir|icao|icoes)$/.test(token)) return 'distribuicao';
  if (/^dividendos?$/.test(token)) return 'dividendo';
  if (/^proventos?$/.test(token)) return 'provento';
  if (/^rendimentos?$/.test(token)) return 'rendimento';
  if (/^cotas?$/.test(token)) return 'cota';
  if (/^ac(?:ao|oes)$/.test(token)) return 'acao';
  if (/^emiss(?:ao|oes)$/.test(token)) return 'emissao';
  if (/^bilh(?:ao|oes)$/.test(token)) return 'bilhao';
  if (/^milh(?:ao|oes)$/.test(token)) return 'milhao';
  if (/^rea(?:l|is)$/.test(token)) return 'real';
  if (/^recompr(?:a|ou|am|ar|as)$/.test(token)) return 'recompra';
  if (/^resultados?$/.test(token)) return 'resultado';
  if (/^lucros?$/.test(token)) return 'lucro';
  if (/^debentures?$/.test(token)) return 'debenture';
  if (/^acionistas?$/.test(token)) return 'acionista';
  if (/^(?:aquisic(?:ao|oes)|adquir(?:e|iu|iram|ir))$/.test(token)) return 'aquisicao';
  if (/^vend(?:a|as|e|eu|er)$/.test(token)) return 'venda';
  if (/^subscric(?:ao|oes)$/.test(token)) return 'subscricao';
  if (/^bonificac(?:ao|oes)$/.test(token)) return 'bonificacao';
  if (/^amortizac(?:ao|oes)$/.test(token)) return 'amortizacao';
  if (/^desdobramentos?$/.test(token)) return 'desdobramento';
  if (/^grupamentos?$/.test(token)) return 'grupamento';
  return token;
}

function inferSpecificTopicFromText(normText: string): NewsEventType | null {
  if (/\b(dividendo|dividendos|jcp|juros sobre capital|provento|proventos|rendimento|rendimentos)\b/.test(normText)) {
    return 'DIVIDEND';
  }
  if (/\b(resultado|resultados|balanco|trimestral|[1-4]t\d{2}|itr|dfp|ebitda|lucro liquido)\b/.test(normText)) {
    return 'EARNINGS';
  }
  if (/\b(emissao|subscricao|debenture|debentures|bonificacao|desdobramento|grupamento|aumento de capital|recompra)\b/.test(normText)) {
    return 'CAPITAL_EVENT';
  }
  if (/\b(aquisicao|compra|fusao|incorporacao|m&a)\b/.test(normText)) {
    return 'ACQUISITION';
  }
  if (/\b(venda|desinvestimento|alienacao)\b/.test(normText)) {
    return 'SALE';
  }
  if (/\b(assembleia|age|ago|convocacao)\b/.test(normText)) {
    return 'ASSEMBLY';
  }
  return null;
}

function hasSpecificTopicMismatch(
  typeA: NewsEventType | undefined,
  normA: string,
  typeB: NewsEventType | undefined,
  normB: string,
): boolean {
  const effectiveA =
    typeA && !GENERIC_COMPATIBLE_EVENT_TYPES.has(typeA) ? typeA : inferSpecificTopicFromText(normA);
  const effectiveB =
    typeB && !GENERIC_COMPATIBLE_EVENT_TYPES.has(typeB) ? typeB : inferSpecificTopicFromText(normB);
  if (!effectiveA || !effectiveB) return false;
  return effectiveA !== effectiveB;
}

function extractMaterialNumericTokensForMatch(normHeadline: string, tickers: string[]): string[] {
  const withoutTickers = stripTickerSymbolsFromNormalizedText(normHeadline, tickers);
  const matches = withoutTickers.match(/\d+(?:[.,]\d+)?/g);
  if (!matches) return [];
  return Array.from(
    new Set(
      matches
        .map(normalizeNumericString)
        .filter((n) => !/^(?:19|20)\d{2}$/.test(n)),
    ),
  ).sort();
}

function analyzeMaterialNumbersForMatch(
  normA: string,
  tickersA: string[],
  normB: string,
  tickersB: string[],
): { conflict: boolean; sharedCount: number } {
  const numsA = extractMaterialNumericTokensForMatch(normA, tickersA);
  const numsB = extractMaterialNumericTokensForMatch(normB, tickersB);
  if (numsA.length === 0 || numsB.length === 0) {
    return { conflict: false, sharedCount: 0 };
  }

  const setB = new Set(numsB);
  const shared = numsA.filter((n) => setB.has(n));
  if (shared.length === 0) {
    return { conflict: true, sharedCount: 0 };
  }

  const setA = new Set(numsA);
  const aHasExtra = numsA.some((n) => !setB.has(n));
  const bHasExtra = numsB.some((n) => !setA.has(n));
  return { conflict: aHasExtra && bHasExtra, sharedCount: shared.length };
}

function areEventTypesCompatibleForIdentity(typeA?: NewsEventType, typeB?: NewsEventType): boolean {
  if (!typeA || !typeB) return true;
  if (typeA === typeB) return true;
  if (GENERIC_COMPATIBLE_EVENT_TYPES.has(typeA) || GENERIC_COMPATIBLE_EVENT_TYPES.has(typeB)) {
    return true;
  }
  if (
    (typeA === 'ASSEMBLY' && typeB === 'REGULATORY') ||
    (typeA === 'REGULATORY' && typeB === 'ASSEMBLY')
  ) {
    return true;
  }
  return false;
}

/**
 * Finds the matching previously persisted event record for an incoming canonical event.
 * Matches cleanly in 3 strict passes:
 *   1. Exact `canonicalEventId` match.
 *   2. URL-overlap official-promotion match (shared source URL + shared ticker).
 *   3. Safe cross-refresh semantic continuity match without URL overlap
 *      (same ticker + compatible eventType + <= 48h window + zero numeric conflict + strong material token similarity).
 */
function findMatchingPersistedEvent(
  event: PortfolioNewsEvent,
  persistedById: Map<string, PersistedPortfolioNewsEventState>,
  persistedAll: PersistedPortfolioNewsEventState[],
  claimedPrevIds: Set<string>,
): PersistedPortfolioNewsEventState | undefined {
  const exact = persistedById.get(event.canonicalEventId);
  if (exact && !claimedPrevIds.has(exact.canonicalEventId)) {
    return exact;
  }

  const { allUrls } = extractNormalizedUrls(event);
  const incomingUrlSet = new Set(allUrls.filter((u) => !u.startsWith('src:')));
  const incomingTickers = Array.from(new Set(event.assets.map((t) => t.toUpperCase().trim()).filter(Boolean)));
  const incomingTickerSet = new Set(incomingTickers);

  // Pass 2: URL overlap fallback
  if (incomingUrlSet.size > 0) {
    for (const candidate of persistedAll) {
      if (claimedPrevIds.has(candidate.canonicalEventId)) continue;
      const prevUrls = candidate.meta?.allSourceUrls || [];
      const sharesUrl = prevUrls.some((u) => incomingUrlSet.has(u));
      if (!sharesUrl) continue;

      const prevTickers = candidate.meta?.tickers || [];
      const sharesTicker =
        prevTickers.length === 0 || prevTickers.some((t) => incomingTickerSet.has(t.toUpperCase()));
      if (sharesTicker) {
        return candidate;
      }
    }
  }

  // Pass 3: Safe semantic cross-refresh continuity fallback (e.g. media-only -> official-only)
  if (incomingTickerSet.size === 0) return undefined;
  const eventTime = Date.parse(event.publishedAt);
  if (!Number.isFinite(eventTime)) return undefined;

  const incomingHeadlineNorm = extractMaterialHeadlineTokens(event.headline);
  const incomingTokens = extractSemanticMaterialTokens(incomingHeadlineNorm, incomingTickers);
  if (incomingTokens.size === 0) return undefined;

  let bestCandidate: PersistedPortfolioNewsEventState | undefined;
  let bestJaccard = 0;
  let bestOverlap = 0;
  let bestTimeDiff = Number.POSITIVE_INFINITY;

  for (const candidate of persistedAll) {
    if (claimedPrevIds.has(candidate.canonicalEventId)) continue;

    const candTickers = (candidate.meta?.tickers || []).map((t) => t.toUpperCase().trim()).filter(Boolean);
    const sharesTicker = candTickers.some((t) => incomingTickerSet.has(t));
    if (!sharesTicker) continue;

    if (!candidate.eventPublishedAt) continue;
    const candTime = Date.parse(candidate.eventPublishedAt);
    if (!Number.isFinite(candTime)) continue;
    const timeDiff = Math.abs(eventTime - candTime);
    if (timeDiff > CROSS_REFRESH_IDENTITY_WINDOW_MS) continue;

    const candEventType = candidate.meta?.eventType;
    if (!areEventTypesCompatibleForIdentity(event.eventType, candEventType)) continue;

    const candHeadlineNorm = candidate.meta?.headlineCore || '';
    if (!candHeadlineNorm) continue;

    if (hasSpecificTopicMismatch(event.eventType, incomingHeadlineNorm, candEventType, candHeadlineNorm)) {
      continue;
    }

    const numCheck = analyzeMaterialNumbersForMatch(
      incomingHeadlineNorm,
      incomingTickers,
      candHeadlineNorm,
      candTickers,
    );
    if (numCheck.conflict) {
      continue;
    }

    const candTokens = extractSemanticMaterialTokens(candHeadlineNorm, candTickers);
    if (candTokens.size === 0) continue;

    let intersection = 0;
    for (const token of incomingTokens) {
      if (candTokens.has(token)) intersection++;
    }
    if (intersection === 0) continue;

    const union = incomingTokens.size + candTokens.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;
    const minLen = Math.min(incomingTokens.size, candTokens.size);
    const overlap = minLen > 0 ? intersection / minLen : 0;

    const sameSpecificEventType =
      candEventType !== undefined &&
      candEventType === event.eventType &&
      !GENERIC_COMPATIBLE_EVENT_TYPES.has(event.eventType);

    const exactSingleTokenMatch =
      incomingTokens.size === 1 && candTokens.size === 1 && intersection === 1;

    const passesThreshold = sameSpecificEventType
      ? exactSingleTokenMatch || (intersection >= 2 && (jaccard >= 0.45 || overlap >= 0.70))
      : (numCheck.sharedCount >= 1 && intersection >= 3 && (jaccard >= 0.35 || overlap >= 0.60)) ||
        (intersection >= 2 && (jaccard >= 0.50 || (overlap >= 0.75 && intersection >= 3)));

    if (!passesThreshold) continue;

    const isBetter =
      jaccard > bestJaccard ||
      (jaccard === bestJaccard && overlap > bestOverlap) ||
      (jaccard === bestJaccard && overlap === bestOverlap && timeDiff < bestTimeDiff);

    if (isBetter) {
      bestCandidate = candidate;
      bestJaccard = jaccard;
      bestOverlap = overlap;
      bestTimeDiff = timeDiff;
    }
  }

  return bestCandidate;
}

/**
 * Materiality weight lookup used by novelty-aware priority sorting.
 */
const MATERIALITY_RANK: Record<NewsMateriality, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  ROUTINE: 1,
};

/**
 * Novelty tier weight within the same materiality band.
 */
const NOVELTY_RANK: Record<PortfolioNewsEventStateType, number> = {
  NEW: 3,
  UPDATED: 2,
  UNCHANGED: 1,
  SEEN: 0,
};

/**
 * Deterministic comparator that respects materiality supremacy first
 * (e.g., CRITICAL SEEN ALWAYS outranks LOW NEW) and boosts NEW/UPDATED within the same tier.
 */
export function compareEventsByMaterialityAndNovelty(a: PortfolioNewsEvent, b: PortfolioNewsEvent): number {
  const matA = MATERIALITY_RANK[a.materiality ?? 'MEDIUM'];
  const matB = MATERIALITY_RANK[b.materiality ?? 'MEDIUM'];
  if (matB !== matA) {
    return matB - matA;
  }

  const novA = a.state ? NOVELTY_RANK[a.state] : 0;
  const novB = b.state ? NOVELTY_RANK[b.state] : 0;
  if (novB !== novA) {
    return novB - novA;
  }

  if (b.importance !== a.importance) {
    return b.importance - a.importance;
  }

  if (b.official !== a.official) {
    return b.official ? 1 : -1;
  }

  const timeA = new Date(a.publishedAt).getTime();
  const timeB = new Date(b.publishedAt).getTime();
  if (timeA !== timeB) {
    return timeB - timeA;
  }

  return (a.canonicalEventId || a.id).localeCompare(b.canonicalEventId || b.id);
}

/**
 * Pure deterministic application of Portfolio News State over canonical events.
 */
export function applyPortfolioNewsState(params: {
  portfolioId: string;
  events: PortfolioNewsEvent[];
  persistedStates: PersistedPortfolioNewsEventState[];
  syncState: PersistedPortfolioNewsSyncState | null;
  referenceDate: Date;
}): ApplyPortfolioNewsStateResult {
  const { portfolioId, events, persistedStates, syncState, referenceDate } = params;
  const nowIso = referenceDate.toISOString();
  const isBaselineRollout = !syncState || !syncState.newsStateInitializedAt;
  const initializedAt = syncState?.newsStateInitializedAt ?? nowIso;

  const alertsInitializedAtFromStates =
    persistedStates
      .map((s) => s.meta?.alertBaselineRecordedAt ?? s.meta?.alertedAt ?? null)
      .filter((v): v is string => Boolean(v))
      .sort()[0] ?? null;
  const isAlertBaselineRollout = !alertsInitializedAtFromStates;
  const alertsInitializedAt = alertsInitializedAtFromStates ?? nowIso;

  const persistedById = new Map<string, PersistedPortfolioNewsEventState>();
  for (const s of persistedStates) {
    persistedById.set(s.canonicalEventId, s);
  }
  const claimedPrevIds = new Set<string>();

  const enrichedEvents: PortfolioNewsEvent[] = [];
  const statesToUpsert: StateTransitionUpsertItem[] = [];
  const newlyDetectedEvents: PortfolioNewsEvent[] = [];
  const updatedDetectedEvents: PortfolioNewsEvent[] = [];

  let newEventsCount = 0;
  let newMaterialEventsCount = 0;
  let updatedEventsCount = 0;
  let seenEventsCount = 0;

  for (const event of events) {
    const fingerprint = computeEventVersionFingerprint(event);
    const { officialUrls, allUrls } = extractNormalizedUrls(event);
    const nextMeta: PersistedPortfolioNewsEventMeta = {
      official: Boolean(event.official),
      eventType: event.eventType,
      materiality: event.materiality ?? 'MEDIUM',
      importance: event.importance,
      sentiment: event.sentiment,
      officialSourceUrls: officialUrls,
      allSourceUrls: allUrls,
      tickers: Array.from(new Set(event.assets.map((t) => t.toUpperCase()))).sort(),
      headlineCore: extractMaterialHeadlineTokens(event.headline),
    };

    const prev = findMatchingPersistedEvent(event, persistedById, persistedStates, claimedPrevIds);
    if (prev) {
      claimedPrevIds.add(prev.canonicalEventId);
    }

    const isNonRegressiveOfficialAbsence =
      Boolean(prev) &&
      prev!.meta?.official === true &&
      !event.official &&
      (prev!.meta?.materiality ?? 'MEDIUM') === (event.materiality ?? 'MEDIUM') &&
      (prev!.meta?.sentiment ?? event.sentiment) === event.sentiment &&
      !hasMaterialTextRevision(
        prev!.meta?.headlineCore,
        nextMeta.headlineCore || '',
        prev!.meta?.headlineCore || '',
        `${event.headline} ${event.summary || ''}`,
      );

    let nextState: PortfolioNewsEventStateType;
    let firstSeenAt = prev?.firstSeenAt ?? nowIso;
    let lastSeenByUserAt = prev?.lastSeenByUserAt ?? null;
    let firstFingerprint = prev?.firstFingerprint ?? fingerprint;
    let latestFingerprintToPersist = fingerprint;
    let persistedMetaToSave: PersistedPortfolioNewsEventMeta = nextMeta;
    let updateReasons: NewsEventUpdateReason[] = [];

    if (!prev) {
      // Brand new event not yet persisted for this portfolio
      nextState = isBaselineRollout ? 'UNCHANGED' : 'NEW';
    } else if (isNonRegressiveOfficialAbsence) {
      // Official feed temporarily omitted an already-known official event while media still echoes it:
      // retain existing lifecycle state, official provenance, and fingerprint without creating NEW or noisy UPDATED.
      nextState = prev.state;
      latestFingerprintToPersist = prev.latestFingerprint;
      if (nextState === 'UPDATED') {
        updateReasons = [...(prev.latestUpdateReasons || [])];
      }
      persistedMetaToSave = {
        ...prev.meta,
        allSourceUrls: Array.from(new Set([...(prev.meta?.allSourceUrls || []), ...allUrls])).sort(),
      };
    } else if (prev.latestFingerprint !== fingerprint) {
      // Event changed meaningfully -> UPDATED (even if previously SEEN, NEW, or UNCHANGED)
      updateReasons = deriveEventUpdateReasons(prev, event);
      nextState = 'UPDATED';
    } else {
      // Exact fingerprint match -> preserve prior lifecycle state without auto-clearing NEW or UPDATED!
      nextState = prev.state;
      if (nextState === 'UPDATED') {
        updateReasons = [...(prev.latestUpdateReasons || [])];
      }
    }

    // Carry forward typed APP-16N alert tracking across refreshes without wiping delivered/baseline markers.
    // On first APP-16N rollout for a portfolio that already has persisted pre-16N NEW/UPDATED rows,
    // record `alertBaselineVersionSuppressed` so existing historical items do NOT trigger retroactive alerts.
    const shouldSuppressPre16nNovel =
      isAlertBaselineRollout &&
      Boolean(prev) &&
      prev!.latestFingerprint === latestFingerprintToPersist &&
      (nextState === 'NEW' || nextState === 'UPDATED');

    persistedMetaToSave = {
      ...persistedMetaToSave,
      alertBaselineRecordedAt: prev?.meta?.alertBaselineRecordedAt ?? alertsInitializedAt,
      alertBaselineVersionSuppressed: shouldSuppressPre16nNovel
        ? latestFingerprintToPersist
        : (prev?.meta?.alertBaselineVersionSuppressed ?? null),
      alertedVersionFingerprint: prev?.meta?.alertedVersionFingerprint ?? null,
      alertedAt: prev?.meta?.alertedAt ?? null,
      alertClaimedFingerprint: prev?.meta?.alertClaimedFingerprint ?? null,
      alertClaimExpiresAt: prev?.meta?.alertClaimExpiresAt ?? null,
    };

    const isNew = nextState === 'NEW';
    const isUpdated = nextState === 'UPDATED';
    const isSeen = nextState === 'SEEN';

    if (isNew) {
      newEventsCount++;
      if (event.materiality === 'CRITICAL' || event.materiality === 'HIGH') {
        newMaterialEventsCount++;
      }
    } else if (isUpdated) {
      updatedEventsCount++;
    } else if (isSeen) {
      seenEventsCount++;
    }

    const enriched: PortfolioNewsEvent = {
      ...event,
      state: nextState,
      firstSeenAt,
      lastObservedAt: nowIso,
      lastSeenByUserAt,
      eventVersionFingerprint: latestFingerprintToPersist,
      isNew,
      isUpdated,
      isSeen,
      updateReasons: updateReasons.length > 0 ? updateReasons : undefined,
    };

    enrichedEvents.push(enriched);
    if (isNew) newlyDetectedEvents.push(enriched);
    if (isUpdated) updatedDetectedEvents.push(enriched);

    statesToUpsert.push({
      portfolioId,
      canonicalEventId: event.canonicalEventId,
      previousCanonicalEventId:
        prev && prev.canonicalEventId !== event.canonicalEventId ? prev.canonicalEventId : undefined,
      firstSeenAt,
      lastObservedAt: nowIso,
      lastSeenByUserAt,
      firstFingerprint,
      latestFingerprint: latestFingerprintToPersist,
      state: nextState,
      latestUpdateReasons: updateReasons,
      eventPublishedAt: event.publishedAt || null,
      meta: persistedMetaToSave,
    });
  }

  enrichedEvents.sort(compareEventsByMaterialityAndNovelty);

  return {
    events: enrichedEvents,
    summary: {
      initialized: true,
      initializedAt,
      lastRefreshedAt: nowIso,
      alertsInitializedAt,
      newEventsCount,
      newMaterialEventsCount,
      updatedEventsCount,
      seenEventsCount,
    },
    syncStateToPersist: {
      portfolioId,
      newsStateInitializedAt: initializedAt,
      lastRefreshedAt: nowIso,
    },
    statesToUpsert,
    newlyDetectedEvents,
    updatedDetectedEvents,
  };
}

/**
 * Pure transition helper for explicitly marking events as SEEN by the user.
 */
export function computeMarkEventsSeenTransitions(params: {
  persistedStates: PersistedPortfolioNewsEventState[];
  canonicalEventIds?: string[];
  markAllNovel?: boolean;
  referenceDate: Date;
}): PersistedPortfolioNewsEventState[] {
  const { persistedStates, canonicalEventIds, markAllNovel = false, referenceDate } = params;
  const nowIso = referenceDate.toISOString();
  const targetSet = canonicalEventIds ? new Set(canonicalEventIds) : null;

  const updated: PersistedPortfolioNewsEventState[] = [];
  for (const item of persistedStates) {
    const isTargeted =
      (targetSet !== null && targetSet.has(item.canonicalEventId)) ||
      (markAllNovel && (item.state === 'NEW' || item.state === 'UPDATED'));

    if (!isTargeted) continue;

    updated.push({
      ...item,
      state: 'SEEN',
      lastSeenByUserAt: nowIso,
      latestUpdateReasons: [],
    });
  }
  return updated;
}
