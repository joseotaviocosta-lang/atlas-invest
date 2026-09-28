import { createHash } from 'node:crypto';
import type {
  MarketIntelligenceItemCategory,
  MarketIntelligenceItemStatus,
  MarketIntelligenceSourceItem,
  MarketIntelligenceSourceType,
} from './types';

// ---------------------------------------------------------------------------
// Phase 3Z — Deterministic market-intelligence normalization, deduplication
// and asset linking (ADR-229, ADR-230, ADR-231).
//
// Pure, deterministic, zero I/O, zero LLM. Operates only on provided records.
// ---------------------------------------------------------------------------

export const MARKET_INTELLIGENCE_HEADLINE_MAX_LENGTH = 500;
export const MARKET_INTELLIGENCE_EXCERPT_MAX_LENGTH = 2000;
export const MARKET_INTELLIGENCE_URL_MAX_LENGTH = 1000;
export const MARKET_INTELLIGENCE_PROVIDER_MAX_LENGTH = 100;
export const MARKET_INTELLIGENCE_ITEM_ID_MAX_LENGTH = 255;

const SOURCE_TYPES: readonly MarketIntelligenceSourceType[] = Object.freeze([
  'NEWS',
  'CORPORATE_ANNOUNCEMENT',
  'MATERIAL_FACT',
  'REGULATORY_FILING',
  'EXCHANGE_NOTICE',
  'OTHER_TRUSTED_MARKET_SOURCE',
]);

const CATEGORIES: readonly MarketIntelligenceItemCategory[] = Object.freeze([
  'MACRO',
  'COMPANY_NEWS',
  'CORPORATE_ANNOUNCEMENT',
  'MATERIAL_FACT',
  'EARNINGS',
  'GOVERNANCE',
  'REGULATORY',
  'DIVIDENDS',
  'OTHER',
]);

const STATUSES: readonly MarketIntelligenceItemStatus[] = Object.freeze([
  'ACTIVE',
  'RETRACTED',
  'SUPERSEDED',
]);

export interface NormalizedMarketIntelligenceItem {
  readonly sourceProvider: string;
  readonly sourceType: MarketIntelligenceSourceType;
  readonly sourceItemId: string;
  readonly headline: string;
  readonly excerpt?: string;
  readonly canonicalUrl?: string;
  readonly publishedAt: Date;
  readonly category: MarketIntelligenceItemCategory;
  readonly language: string;
  readonly rawSymbols: readonly string[];
  readonly status: MarketIntelligenceItemStatus;
  /** Stable deterministic fingerprint for audit (never used to merge across providers). */
  readonly fingerprint: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Stable fingerprint of a normalized source record.
 * Scope: audit/diagnostics only. Cross-provider stories are NEVER auto-merged (ADR-231).
 */
export function fingerprintMarketIntelligenceItem(item: {
  readonly sourceProvider: string;
  readonly sourceItemId: string;
  readonly headline: string;
  readonly publishedAt: Date;
}): string {
  const canonical = [
    item.sourceProvider.trim(),
    item.sourceItemId.trim(),
    item.headline.trim().toLowerCase(),
    item.publishedAt.toISOString(),
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Validates and normalizes one raw source record. Returns null when the
 * record is malformed or exceeds explicit caps (fail-safe rejection, ADR-229).
 */
export function normalizeMarketIntelligenceItem(
  raw: unknown,
): NormalizedMarketIntelligenceItem | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (!isNonEmptyString(r.sourceProvider)) return null;
  if (!isNonEmptyString(r.sourceItemId)) return null;
  if (!isNonEmptyString(r.headline)) return null;
  if (typeof r.sourceType !== 'string' || !SOURCE_TYPES.includes(r.sourceType as never)) {
    return null;
  }
  if (typeof r.category !== 'string' || !CATEGORIES.includes(r.category as never)) return null;

  const publishedAt = toDate(r.publishedAt);
  if (!publishedAt) return null;

  const status =
    typeof r.status === 'string' && STATUSES.includes(r.status as never)
      ? (r.status as MarketIntelligenceItemStatus)
      : 'ACTIVE';

  const headline = (r.headline as string).trim().replace(/\s+/g, ' ');
  if (headline.length > MARKET_INTELLIGENCE_HEADLINE_MAX_LENGTH) return null;

  let excerpt: string | undefined;
  if (r.excerpt !== undefined && r.excerpt !== null) {
    if (typeof r.excerpt !== 'string') return null;
    excerpt = r.excerpt.trim().replace(/\s+/g, ' ');
    if (excerpt.length === 0) {
      excerpt = undefined;
    } else if (excerpt.length > MARKET_INTELLIGENCE_EXCERPT_MAX_LENGTH) {
      return null;
    }
  }

  let canonicalUrl: string | undefined;
  if (r.canonicalUrl !== undefined && r.canonicalUrl !== null) {
    if (typeof r.canonicalUrl !== 'string') return null;
    const url = r.canonicalUrl.trim();
    if (url.length > MARKET_INTELLIGENCE_URL_MAX_LENGTH) return null;
    if (url.length > 0) {
      if (!/^https?:\/\//i.test(url)) return null;
      canonicalUrl = url;
    }
  }

  const sourceProvider = (r.sourceProvider as string).trim();
  if (sourceProvider.length > MARKET_INTELLIGENCE_PROVIDER_MAX_LENGTH) return null;
  const sourceItemId = (r.sourceItemId as string).trim();
  if (sourceItemId.length > MARKET_INTELLIGENCE_ITEM_ID_MAX_LENGTH) return null;

  let language = 'pt-BR';
  if (typeof r.language === 'string' && r.language.trim().length > 0) {
    language = r.language.trim().slice(0, 10);
  }

  let rawSymbols: readonly string[] = Object.freeze([]);
  if (Array.isArray(r.rawSymbols)) {
    const cleaned = r.rawSymbols
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().toUpperCase())
      .slice(0, 25);
    // Deterministic dedup preserving first-seen order
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const s of cleaned) {
      if (!seen.has(s)) {
        seen.add(s);
        deduped.push(s);
      }
    }
    rawSymbols = Object.freeze(deduped);
  }

  const normalized: NormalizedMarketIntelligenceItem = {
    sourceProvider,
    sourceType: r.sourceType as MarketIntelligenceSourceType,
    sourceItemId,
    headline,
    ...(excerpt !== undefined ? { excerpt } : {}),
    ...(canonicalUrl !== undefined ? { canonicalUrl } : {}),
    publishedAt,
    category: r.category as MarketIntelligenceItemCategory,
    language,
    rawSymbols,
    status,
    fingerprint: '',
  };
  return {
    ...normalized,
    fingerprint: fingerprintMarketIntelligenceItem({
      sourceProvider,
      sourceItemId,
      headline,
      publishedAt,
    }),
  };
}

export interface DedupeMarketIntelligenceResult {
  readonly unique: readonly NormalizedMarketIntelligenceItem[];
  readonly duplicateCount: number;
}

/**
 * Deterministic exact-duplicate elimination by (sourceProvider, sourceItemId).
 * Cross-provider similar headlines are NEVER merged (ADR-231).
 */
export function dedupeMarketIntelligenceItems(
  items: readonly NormalizedMarketIntelligenceItem[],
): DedupeMarketIntelligenceResult {
  const seen = new Set<string>();
  const unique: NormalizedMarketIntelligenceItem[] = [];
  let duplicateCount = 0;
  for (const item of items) {
    const key = `${item.sourceProvider}::${item.sourceItemId}`;
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return { unique: Object.freeze(unique), duplicateCount };
}

export interface AssetLinkResolution {
  readonly symbol: string;
  readonly assetIds: readonly string[];
  /** 'LINKED' | 'UNLINKED_UNKNOWN' | 'UNLINKED_AMBIGUOUS' */
  readonly outcome: 'LINKED' | 'UNLINKED_UNKNOWN' | 'UNLINKED_AMBIGUOUS';
}

/**
 * Deterministic AssetId linking (ADR-230). Ticker is display metadata only.
 *
 * - exactly one canonical asset for the symbol -> LINKED
 * - zero matches -> UNLINKED_UNKNOWN (item stays unlinked, never guessed)
 * - more than one match (same ticker, several exchanges) -> UNLINKED_AMBIGUOUS
 *
 * No LLM involvement. The lookup is injected so this module stays DB-free.
 */
export function resolveMarketIntelligenceAssetLinks(
  rawSymbols: readonly string[],
  lookupByTicker: (ticker: string) => readonly string[],
): readonly AssetLinkResolution[] {
  const out: AssetLinkResolution[] = [];
  const seen = new Set<string>();
  for (const raw of rawSymbols) {
    const symbol = raw.trim().toUpperCase();
    if (symbol.length === 0 || seen.has(symbol)) continue;
    seen.add(symbol);
    const matches = lookupByTicker(symbol);
    if (matches.length === 1) {
      out.push({ symbol, assetIds: Object.freeze([matches[0]!]), outcome: 'LINKED' });
    } else if (matches.length === 0) {
      out.push({ symbol, assetIds: Object.freeze([]), outcome: 'UNLINKED_UNKNOWN' });
    } else {
      out.push({
        symbol,
        assetIds: Object.freeze([]),
        outcome: 'UNLINKED_AMBIGUOUS',
      });
    }
  }
  return Object.freeze(out);
}

/** Collects the union of LINKED assetIds across symbol resolutions. */
export function collectLinkedAssetIds(
  resolutions: readonly AssetLinkResolution[],
): readonly string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of resolutions) {
    if (r.outcome !== 'LINKED') continue;
    for (const id of r.assetIds) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return Object.freeze(ids);
}

export type { MarketIntelligenceSourceItem };
