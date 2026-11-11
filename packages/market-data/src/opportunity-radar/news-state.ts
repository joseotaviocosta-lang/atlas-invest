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
  materiality?: NewsMateriality;
  importance?: NewsImportance;
  sentiment?: NewsSentiment;
  officialSourceUrls?: string[];
  allSourceUrls?: string[];
  tickers?: string[];
  headlineCore?: string;
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
 * Finds the matching previously persisted event record for an incoming canonical event.
 * Matches by exact `canonicalEventId` first, then falls back cleanly to URL-overlap official-promotion
 * matching in case a media cluster absorbed a retroactive regulatory timestamp and shifted cluster seed ID.
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

  // Fallback promotion match: incoming official event contains a source URL already recorded on an unmatched persisted event
  const { allUrls } = extractNormalizedUrls(event);
  if (allUrls.length === 0) return undefined;

  const incomingUrlSet = new Set(allUrls.filter((u) => !u.startsWith('src:')));
  if (incomingUrlSet.size === 0) return undefined;

  const incomingTickers = new Set(event.assets.map((t) => t.toUpperCase()));

  for (const candidate of persistedAll) {
    if (claimedPrevIds.has(candidate.canonicalEventId)) continue;
    const prevUrls = candidate.meta?.allSourceUrls || [];
    const sharesUrl = prevUrls.some((u) => incomingUrlSet.has(u));
    if (!sharesUrl) continue;

    const prevTickers = candidate.meta?.tickers || [];
    const sharesTicker =
      prevTickers.length === 0 || prevTickers.some((t) => incomingTickers.has(t.toUpperCase()));
    if (sharesTicker) {
      return candidate;
    }
  }

  return undefined;
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

    let nextState: PortfolioNewsEventStateType;
    let firstSeenAt = prev?.firstSeenAt ?? nowIso;
    let lastSeenByUserAt = prev?.lastSeenByUserAt ?? null;
    let firstFingerprint = prev?.firstFingerprint ?? fingerprint;
    let updateReasons: NewsEventUpdateReason[] = [];

    if (!prev) {
      // Brand new event not yet persisted for this portfolio
      nextState = isBaselineRollout ? 'UNCHANGED' : 'NEW';
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
      eventVersionFingerprint: fingerprint,
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
      latestFingerprint: fingerprint,
      state: nextState,
      latestUpdateReasons: updateReasons,
      eventPublishedAt: event.publishedAt || null,
      meta: nextMeta,
    });
  }

  enrichedEvents.sort(compareEventsByMaterialityAndNovelty);

  return {
    events: enrichedEvents,
    summary: {
      initialized: true,
      initializedAt,
      lastRefreshedAt: nowIso,
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
