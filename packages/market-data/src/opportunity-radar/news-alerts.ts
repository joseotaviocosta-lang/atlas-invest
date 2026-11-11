/**
 * Project Atlas — Local Material News Alerts Engine (APP-16N)
 *
 * Pure deterministic eligibility, privacy-safe payload formatting, batching,
 * and notifier contract for local Windows/Desktop alerts.
 *
 * Architectural Invariants:
 * 1. Strictly pure & OS-agnostic: ZERO Tauri, Windows, DOM, Prisma, or HTTP dependencies.
 * 2. Alert only when `state ∈ {NEW, UPDATED}` AND `materiality ∈ {CRITICAL, HIGH}` (default threshold).
 * 3. NEVER alters `News Score V2`, `Opportunity Score`, `materiality`, `sentiment`, or `confidence`.
 * 4. Strict fail-closed repeat/concurrency suppression via `eventVersionFingerprint`.
 * 5. Zero background monitoring: evaluated strictly on explicit/active in-app news refreshes.
 * 6. Privacy-safe payloads: exposes only ticker, headline, materialityReason, and official provenance.
 */

import type {
  NewsAlertDeliveryStatus,
  NewsAlertThreshold,
  NewsAlertType,
  NewsMateriality,
  PortfolioNewsAlertCandidateDto,
  PortfolioNewsEvent,
} from './portfolio-news.types.js';
import type { PersistedPortfolioNewsEventMeta } from './news-state.js';

export interface AlertPersistedStateRef {
  canonicalEventId: string;
  firstSeenAt?: string;
  lastObservedAt?: string;
  latestFingerprint?: string;
  meta?: PersistedPortfolioNewsEventMeta;
}

export interface SelectAlertEligibleOptions {
  threshold?: NewsAlertThreshold;
  enabled?: boolean;
  referenceDate?: Date;
  /** Timestamp when alerts were enabled; events already observed at or before this time are not retroactively alerted. */
  alertsActivatedAt?: string | null;
}

export interface AlertSelectionDiagnostics {
  eligibleAlerts: number;
  suppressedAlreadyDelivered: number;
  suppressedBaseline: number;
  suppressedByMateriality: number;
  suppressedByState: number;
  suppressedByToggle: number;
}

export interface NewsAlertCandidate extends PortfolioNewsAlertCandidateDto {
  event: PortfolioNewsEvent;
}

export interface NewsAlertDispatchItem {
  kind: 'SINGLE' | 'BATCH';
  type: NewsAlertType;
  title: string;
  body: string;
  deepLink: string;
  coveredEventKeys: Array<{
    canonicalEventId: string;
    eventVersionFingerprint: string;
  }>;
  candidates: NewsAlertCandidate[];
}

export interface NewsAlertDeliveryResult {
  status: NewsAlertDeliveryStatus;
  reason?: string;
  notificationId?: string;
}

export interface NewsAlertNotifier {
  notifyMaterialNews(payload: NewsAlertDispatchItem): Promise<NewsAlertDeliveryResult>;
}

export interface FakeCapturedNewsAlert {
  event: NewsAlertCandidate | null;
  events: NewsAlertCandidate[];
  type: NewsAlertType;
  title: string;
  body: string;
  payload: NewsAlertDispatchItem;
  deliveryResult: NewsAlertDeliveryResult;
}

/**
 * Deterministic test adapter capturing material news alerts in memory (APP-16N).
 */
export class FakeNewsAlertNotifier implements NewsAlertNotifier {
  public readonly captured: FakeCapturedNewsAlert[] = [];
  private nextStatus: NewsAlertDeliveryStatus = 'DELIVERED';
  private nextReason?: string;

  setMode(status: NewsAlertDeliveryStatus, reason?: string): void {
    this.nextStatus = status;
    this.nextReason = reason;
  }

  async notifyMaterialNews(payload: NewsAlertDispatchItem): Promise<NewsAlertDeliveryResult> {
    const result: NewsAlertDeliveryResult = {
      status: this.nextStatus,
      reason: this.nextReason,
      notificationId:
        this.nextStatus === 'DELIVERED'
          ? `fake-alert-${this.captured.length + 1}`
          : undefined,
    };

    this.captured.push({
      event: payload.candidates.length === 1 ? payload.candidates[0]! : null,
      events: [...payload.candidates],
      type: payload.type,
      title: payload.title,
      body: payload.body,
      payload,
      deliveryResult: result,
    });

    return result;
  }

  clear(): void {
    this.captured.length = 0;
  }
}

export function buildAlertIdentityKey(
  portfolioId: string,
  canonicalEventId: string,
  eventVersionFingerprint: string,
): string {
  return `${portfolioId}:${canonicalEventId}:${eventVersionFingerprint}`;
}

export function isMaterialityEligibleForThreshold(
  materiality: NewsMateriality | undefined,
  threshold: NewsAlertThreshold = 'HIGH_AND_CRITICAL',
): boolean {
  const level = materiality ?? 'MEDIUM';
  switch (threshold) {
    case 'CRITICAL_ONLY':
      return level === 'CRITICAL';
    case 'HIGH_AND_CRITICAL':
      return level === 'CRITICAL' || level === 'HIGH';
    case 'ALL_MATERIAL':
      return level === 'CRITICAL' || level === 'HIGH' || level === 'MEDIUM';
  }
}

export function resolveOfficialSourceLabel(event: PortfolioNewsEvent): string | undefined {
  if (!event.official) return undefined;
  if (event.provider === 'CVM') return 'CVM';
  if (event.provider === 'B3') return 'B3';

  const sources = event.sources ?? [];
  const hasCvm = sources.some((s) => {
    const upperName = s.name.toUpperCase();
    const lowerUrl = s.url.toLowerCase();
    return upperName.includes('CVM') || lowerUrl.includes('cvm.gov.br');
  });
  if (hasCvm) return 'CVM';

  const hasB3 = sources.some((s) => {
    const upperName = s.name.toUpperCase();
    const lowerUrl = s.url.toLowerCase();
    return upperName.includes('B3') || upperName.includes('FNET') || lowerUrl.includes('fnet.bmfbovespa');
  });
  if (hasB3) return 'B3';

  return 'CVM/B3';
}

function sanitizeAlertHeadlineText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function resolvePrimaryTicker(event: PortfolioNewsEvent): string {
  return (
    event.primaryTickers?.[0] ||
    event.assets?.[0] ||
    'CARTEIRA'
  ).toUpperCase().trim();
}

/**
 * Pure O(n) selection of alert-eligible news events after APP-16M state evaluation.
 */
export function selectAlertEligibleNewsEvents(params: {
  portfolioId: string;
  events: PortfolioNewsEvent[];
  persistedStates?:
    | ReadonlyArray<AlertPersistedStateRef>
    | ReadonlyMap<string, AlertPersistedStateRef>;
  options?: SelectAlertEligibleOptions;
}): {
  eligibleCandidates: NewsAlertCandidate[];
  diagnostics: AlertSelectionDiagnostics;
} {
  const { portfolioId, events, persistedStates, options } = params;
  const threshold = options?.threshold ?? 'HIGH_AND_CRITICAL';
  const enabled = options?.enabled ?? true;
  const nowMs = (options?.referenceDate ?? new Date()).getTime();
  const activatedAtMs = options?.alertsActivatedAt ? Date.parse(options.alertsActivatedAt) : NaN;

  const stateMap = new Map<string, AlertPersistedStateRef>();
  if (persistedStates instanceof Map) {
    for (const [key, val] of persistedStates.entries()) {
      stateMap.set(key, val);
    }
  } else if (Array.isArray(persistedStates)) {
    for (const item of persistedStates) {
      stateMap.set(item.canonicalEventId, item);
    }
  }

  const diagnostics: AlertSelectionDiagnostics = {
    eligibleAlerts: 0,
    suppressedAlreadyDelivered: 0,
    suppressedBaseline: 0,
    suppressedByMateriality: 0,
    suppressedByState: 0,
    suppressedByToggle: 0,
  };

  const eligibleCandidates: NewsAlertCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const event of events) {
    const state = event.state;
    if (state !== 'NEW' && state !== 'UPDATED') {
      diagnostics.suppressedByState++;
      continue;
    }

    const materiality = event.materiality ?? 'MEDIUM';
    if (!isMaterialityEligibleForThreshold(materiality, threshold)) {
      diagnostics.suppressedByMateriality++;
      continue;
    }

    if (!enabled) {
      diagnostics.suppressedByToggle++;
      continue;
    }

    const fingerprint = event.eventVersionFingerprint?.trim();
    if (!fingerprint) {
      // Fail-closed: refuse to emit alert if version identity cannot be anchored cleanly
      diagnostics.suppressedByState++;
      continue;
    }

    const identityKey = buildAlertIdentityKey(portfolioId, event.canonicalEventId, fingerprint);
    if (seenKeys.has(identityKey)) {
      continue;
    }
    seenKeys.add(identityKey);

    const persisted = stateMap.get(event.canonicalEventId);
    const meta = persisted?.meta;

    if (meta?.alertedVersionFingerprint === fingerprint) {
      diagnostics.suppressedAlreadyDelivered++;
      continue;
    }

    if (meta?.alertBaselineVersionSuppressed === fingerprint) {
      diagnostics.suppressedBaseline++;
      continue;
    }

    if (meta?.alertClaimedFingerprint === fingerprint && meta.alertClaimExpiresAt) {
      const expiresMs = Date.parse(meta.alertClaimExpiresAt);
      if (Number.isFinite(expiresMs) && expiresMs > nowMs) {
        diagnostics.suppressedAlreadyDelivered++;
        continue;
      }
    }

    // Toggle OFF -> ON guard: never retroactively fire for versions observed before alerts were turned on
    if (Number.isFinite(activatedAtMs) && persisted?.firstSeenAt) {
      const versionTimestamp =
        state === 'NEW'
          ? Date.parse(persisted.firstSeenAt)
          : Date.parse(persisted.lastObservedAt ?? persisted.firstSeenAt);
      if (Number.isFinite(versionTimestamp) && versionTimestamp <= activatedAtMs) {
        diagnostics.suppressedBaseline++;
        continue;
      }
    }

    const candidate: NewsAlertCandidate = {
      portfolioId,
      canonicalEventId: event.canonicalEventId,
      eventVersionFingerprint: fingerprint,
      alertIdentityKey: identityKey,
      state,
      materiality,
      ticker: resolvePrimaryTicker(event),
      headline: sanitizeAlertHeadlineText(event.headline),
      materialityReason: event.materialityReason ? sanitizeAlertHeadlineText(event.materialityReason) : undefined,
      official: Boolean(event.official),
      officialSourceLabel: resolveOfficialSourceLabel(event),
      publishedAt: event.publishedAt,
      event,
    };

    eligibleCandidates.push(candidate);
  }

  diagnostics.eligibleAlerts = eligibleCandidates.length;
  return { eligibleCandidates, diagnostics };
}

function buildSingleAlertPayload(candidate: NewsAlertCandidate): NewsAlertDispatchItem {
  const isCritical = candidate.materiality === 'CRITICAL';
  const isUpdated = candidate.state === 'UPDATED';
  const provenanceLine = candidate.official && candidate.officialSourceLabel
    ? `\nFonte oficial: ${candidate.officialSourceLabel}`
    : '';

  let type: NewsAlertType;
  let title: string;
  let body: string;

  if (isCritical) {
    type = isUpdated ? 'CRITICAL_UPDATE' : 'CRITICAL_NEW';
    title = 'Atlas Invest — Evento crítico';
    const detail = isUpdated
      ? `Atualização importante — ${candidate.ticker}\n${candidate.materialityReason || candidate.headline}`
      : `${candidate.ticker}\n${candidate.materialityReason || candidate.headline}`;
    body = `${detail}${provenanceLine}`;
  } else if (isUpdated) {
    type = 'MATERIAL_UPDATE';
    title = 'Atlas Invest';
    body = `Atualização importante — ${candidate.ticker}\n${candidate.headline}${provenanceLine}`;
  } else {
    type = 'MATERIAL_NEW';
    title = 'Atlas Invest';
    body = `${candidate.ticker} — Nova notícia de alta relevância\n${candidate.headline}${provenanceLine}`;
  }

  return {
    kind: 'SINGLE',
    type,
    title,
    body,
    deepLink: '/today',
    coveredEventKeys: [
      {
        canonicalEventId: candidate.canonicalEventId,
        eventVersionFingerprint: candidate.eventVersionFingerprint,
      },
    ],
    candidates: [candidate],
  };
}

/**
 * Formats and batches eligible alert candidates:
 * - CRITICAL events ALWAYS receive individual notifications (never hidden inside batch summaries).
 * - Non-CRITICAL events: 1–3 -> individual; >3 -> 1 consolidated summary payload.
 */
export function buildMaterialNewsAlertPayloads(
  candidates: ReadonlyArray<NewsAlertCandidate>,
): NewsAlertDispatchItem[] {
  if (candidates.length === 0) return [];

  const critical = candidates.filter((c) => c.materiality === 'CRITICAL');
  const nonCritical = candidates.filter((c) => c.materiality !== 'CRITICAL');

  const payloads: NewsAlertDispatchItem[] = [];

  for (const crit of critical) {
    payloads.push(buildSingleAlertPayload(crit));
  }

  if (nonCritical.length === 0) {
    return payloads;
  }

  if (nonCritical.length <= 3) {
    for (const item of nonCritical) {
      payloads.push(buildSingleAlertPayload(item));
    }
    return payloads;
  }

  // Batch summary when >3 non-CRITICAL events would otherwise cause notification spam
  const uniqueTickers = Array.from(new Set(nonCritical.map((c) => c.ticker)));
  const previewTickers = uniqueTickers.slice(0, 3);
  const remainingCount = Math.max(0, nonCritical.length - previewTickers.length);
  const tickerLine =
    remainingCount > 0
      ? `${previewTickers.join(', ')} e mais ${remainingCount}.`
      : `${previewTickers.join(', ')}.`;

  payloads.push({
    kind: 'BATCH',
    type: 'MATERIAL_BATCH_SUMMARY',
    title: 'Atlas Invest',
    body: `${nonCritical.length} novas notícias relevantes na sua carteira.\n${tickerLine}`,
    deepLink: '/today',
    coveredEventKeys: nonCritical.map((c) => ({
      canonicalEventId: c.canonicalEventId,
      eventVersionFingerprint: c.eventVersionFingerprint,
    })),
    candidates: [...nonCritical],
  });

  return payloads;
}

export interface AlertDeliveryCoordinatorPorts {
  claimPendingAlerts(input: {
    portfolioId: string;
    candidates: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>;
  }): Promise<Array<{ canonicalEventId: string; eventVersionFingerprint: string }>>;
  confirmAlertsDelivered(input: {
    portfolioId: string;
    delivered: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>;
  }): Promise<void>;
  releaseAlertsClaim(input: {
    portfolioId: string;
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>;
  }): Promise<void>;
}

/**
 * Coordinates atomic claim -> OS delivery -> confirm/release for a portfolio batch.
 * Guarantees fail-closed duplicate prevention while never marking failed/denied
 * notifications as delivered.
 */
export async function deliverMaterialNewsAlerts(params: {
  portfolioId: string;
  candidates: ReadonlyArray<NewsAlertCandidate>;
  notifier: NewsAlertNotifier;
  ports?: AlertDeliveryCoordinatorPorts;
}): Promise<{
  deliveredCount: number;
  deliveredEventKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>;
  status: NewsAlertDeliveryStatus;
  results: NewsAlertDeliveryResult[];
}> {
  const { portfolioId, candidates, notifier, ports } = params;
  if (candidates.length === 0) {
    return {
      deliveredCount: 0,
      deliveredEventKeys: [],
      status: 'NO_ELIGIBLE_EVENTS',
      results: [],
    };
  }

  let activeCandidates = [...candidates];

  if (ports) {
    const claimed = await ports.claimPendingAlerts({
      portfolioId,
      candidates: candidates.map((c) => ({
        canonicalEventId: c.canonicalEventId,
        eventVersionFingerprint: c.eventVersionFingerprint,
      })),
    });

    const claimedSet = new Set(
      claimed.map((k) => `${k.canonicalEventId}::${k.eventVersionFingerprint}`),
    );
    activeCandidates = candidates.filter((c) =>
      claimedSet.has(`${c.canonicalEventId}::${c.eventVersionFingerprint}`),
    );

    if (activeCandidates.length === 0) {
      return {
        deliveredCount: 0,
        deliveredEventKeys: [],
        status: 'NO_ELIGIBLE_EVENTS',
        results: [],
      };
    }
  }

  const payloads = buildMaterialNewsAlertPayloads(activeCandidates);
  const deliveredEventKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];
  const failedEventKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];
  const results: NewsAlertDeliveryResult[] = [];
  let lastNonDeliveredStatus: NewsAlertDeliveryStatus | null = null;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i]!;
    let result: NewsAlertDeliveryResult;

    try {
      result = await notifier.notifyMaterialNews(payload);
    } catch (error) {
      result = {
        status: 'DELIVERY_FAILED',
        reason: error instanceof Error ? error.message : 'Notification delivery threw an error',
      };
    }

    results.push(result);

    if (result.status === 'DELIVERED') {
      deliveredEventKeys.push(...payload.coveredEventKeys);
    } else {
      failedEventKeys.push(...payload.coveredEventKeys);
      lastNonDeliveredStatus = result.status;

      // Permission denied or platform unsupported affects remaining payloads in this batch too -> release & stop
      if (
        result.status === 'NOTIFICATIONS_PERMISSION_DENIED' ||
        result.status === 'NOTIFICATIONS_UNSUPPORTED' ||
        result.status === 'NOTIFICATIONS_UNAVAILABLE'
      ) {
        for (let j = i + 1; j < payloads.length; j++) {
          failedEventKeys.push(...payloads[j]!.coveredEventKeys);
        }
        break;
      }
    }
  }

  if (ports) {
    if (deliveredEventKeys.length > 0) {
      await ports.confirmAlertsDelivered({
        portfolioId,
        delivered: deliveredEventKeys,
      });
    }
    if (failedEventKeys.length > 0) {
      await ports.releaseAlertsClaim({
        portfolioId,
        items: failedEventKeys,
      });
    }
  }

  const overallStatus: NewsAlertDeliveryStatus =
    deliveredEventKeys.length > 0
      ? 'DELIVERED'
      : lastNonDeliveredStatus ?? 'DELIVERY_FAILED';

  return {
    deliveredCount: deliveredEventKeys.length,
    deliveredEventKeys,
    status: overallStatus,
    results,
  };
}
