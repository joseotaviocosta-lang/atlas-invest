import type {
  PortfolioNewsAlertAuditItemDto,
  PortfolioNewsAlertCandidateDto,
  PortfolioNewsAlertHistoryStatusDto,
  PortfolioNewsInboxResponseDto,
} from '../portfolio/types';
import type {
  LocalNotification,
  MaterialNewsAlertThreshold,
  NotificationPreferences,
  NotificationService,
} from './types';
import { isInQuietHours, stringToNumericId } from './engine';
import { getNotificationService } from './service';
import { notificationCenter } from './notification-center';

export type ClientNewsAlertDeliveryStatus =
  | 'DELIVERED'
  | 'SUPPRESSED_QUIET_HOURS'
  | 'NOTIFICATIONS_PERMISSION_DENIED'
  | 'NOTIFICATIONS_UNSUPPORTED'
  | 'NOTIFICATIONS_UNAVAILABLE'
  | 'DELIVERY_FAILED'
  | 'DISABLED'
  | 'NO_ELIGIBLE_EVENTS';

export type ClientNewsAlertType =
  | 'CRITICAL_NEW'
  | 'CRITICAL_UPDATE'
  | 'MATERIAL_NEW'
  | 'MATERIAL_UPDATE'
  | 'MATERIAL_BATCH_SUMMARY';

export interface ClientNewsAlertPayload {
  kind: 'SINGLE' | 'BATCH';
  type: ClientNewsAlertType;
  title: string;
  body: string;
  deepLink: string;
  severity: 'HIGH' | 'NORMAL';
  coveredEventKeys: Array<{
    canonicalEventId: string;
    eventVersionFingerprint: string;
  }>;
  candidates: PortfolioNewsAlertCandidateDto[];
}

export interface ClientNewsAlertDeliveryResult {
  status: ClientNewsAlertDeliveryStatus;
  reason?: string;
}

export interface ClientNewsAlertNotifier {
  notifyMaterialNews(payload: ClientNewsAlertPayload): Promise<ClientNewsAlertDeliveryResult>;
}

export interface NewsAlertCoordinatorPorts {
  claimPendingAlerts(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<Array<{ canonicalEventId: string; eventVersionFingerprint: string }>>;
  confirmAlertsDelivered(
    portfolioId: string,
    items: PortfolioNewsAlertAuditItemDto[],
    meta?: { alertAttemptId?: string; notificationId?: string | null },
  ): Promise<void>;
  releaseAlertsClaim(
    portfolioId: string,
    items: PortfolioNewsAlertAuditItemDto[],
    meta?: {
      deliveryStatus?: Exclude<PortfolioNewsAlertHistoryStatusDto, 'DELIVERED'>;
      failureReason?: string | null;
      attemptedAt?: string;
      alertAttemptId?: string;
      recordHistory?: boolean;
    },
  ): Promise<void>;
  suppressBaseline(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<void>;
}

function createAttemptUuid(): string {
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  const hex = Date.now().toString(16).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${hex}`;
}

function sanitizeClientFailureReason(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const firstLine = raw.split(/\r?\n/)[0] ?? '';
  const cleaned = firstLine
    .replace(/\b(bearer|token|secret|password|apikey|api_key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, 280) : null;
}

function mapClientStatusToHistoryStatus(
  status: ClientNewsAlertDeliveryStatus,
): Exclude<PortfolioNewsAlertHistoryStatusDto, 'DELIVERED'> {
  switch (status) {
    case 'NOTIFICATIONS_PERMISSION_DENIED':
      return 'PERMISSION_DENIED';
    case 'NOTIFICATIONS_UNSUPPORTED':
      return 'UNSUPPORTED';
    case 'NOTIFICATIONS_UNAVAILABLE':
      return 'UNAVAILABLE';
    default:
      return 'DELIVERY_FAILED';
  }
}

function buildClientAuditItems(params: {
  payload: ClientNewsAlertPayload;
  alertAttemptId: string;
  attemptedAt: string;
  claimedAt: string;
  deliveryStatus: PortfolioNewsAlertHistoryStatusDto;
  notificationId?: string | null;
  failureReason?: string | null;
}): PortfolioNewsAlertAuditItemDto[] {
  const {
    payload,
    alertAttemptId,
    attemptedAt,
    claimedAt,
    deliveryStatus,
    notificationId = null,
    failureReason = null,
  } = params;
  const batchTickers =
    payload.kind === 'BATCH'
      ? Array.from(new Set(payload.candidates.map((c) => c.ticker)))
      : [payload.candidates[0]?.ticker ?? ''];
  return payload.candidates.map((c) => ({
    canonicalEventId: c.canonicalEventId,
    eventVersionFingerprint: c.eventVersionFingerprint,
    ticker: c.ticker,
    eventState: c.state,
    materiality: c.materiality,
    alertType: payload.type,
    headlineSnapshot: c.headline.slice(0, 500),
    materialityReasonSnapshot: c.materialityReason ? c.materialityReason.slice(0, 500) : null,
    sourceLabelSnapshot: c.officialSourceLabel ? c.officialSourceLabel.slice(0, 120) : null,
    claimedAt,
    attemptedAt,
    deliveredAt: deliveryStatus === 'DELIVERED' ? attemptedAt : null,
    notificationId,
    batchEventCount: payload.kind === 'BATCH' ? payload.candidates.length : 1,
    batchTickers: batchTickers.filter(Boolean),
    alertAttemptId,
    deliveryStatus,
    failureReason,
  }));
}

export interface NewsAlertProcessingDiagnostics {
  eligibleAlerts: number;
  deliveredAlerts: number;
  suppressedAlreadyDelivered: number;
  suppressedByMateriality: number;
  notificationStatus: ClientNewsAlertDeliveryStatus;
}

const portfolioMutexTail = new Map<string, Promise<unknown>>();

/**
 * Serializes alert evaluation per portfolio within the Desktop runtime to prevent race conditions
 * across overlapping fetches/refreshes.
 */
export function withPortfolioNewsAlertMutex<T>(
  portfolioId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = portfolioMutexTail.get(portfolioId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  portfolioMutexTail.set(portfolioId, tail);
  void tail.finally(() => {
    if (portfolioMutexTail.get(portfolioId) === tail) {
      portfolioMutexTail.delete(portfolioId);
    }
  });
  return next;
}

function isCandidateMaterialityEligible(
  materiality: PortfolioNewsAlertCandidateDto['materiality'],
  threshold: MaterialNewsAlertThreshold,
): boolean {
  if (threshold === 'CRITICAL_ONLY') return materiality === 'CRITICAL';
  if (threshold === 'HIGH_AND_CRITICAL') return materiality === 'CRITICAL' || materiality === 'HIGH';
  return materiality === 'CRITICAL' || materiality === 'HIGH' || materiality === 'MEDIUM';
}

function buildSinglePayload(candidate: PortfolioNewsAlertCandidateDto): ClientNewsAlertPayload {
  const isCritical = candidate.materiality === 'CRITICAL';
  const isUpdated = candidate.state === 'UPDATED';
  const provenanceLine =
    candidate.official && candidate.officialSourceLabel
      ? `\nFonte oficial: ${candidate.officialSourceLabel}`
      : '';

  if (isCritical) {
    const detail = isUpdated
      ? `Atualização importante — ${candidate.ticker}\n${candidate.materialityReason || candidate.headline}`
      : `${candidate.ticker}\n${candidate.materialityReason || candidate.headline}`;
    return {
      kind: 'SINGLE',
      type: isUpdated ? 'CRITICAL_UPDATE' : 'CRITICAL_NEW',
      title: 'Atlas Invest — Evento crítico',
      body: `${detail}${provenanceLine}`,
      deepLink: '/today',
      severity: 'HIGH',
      coveredEventKeys: [
        {
          canonicalEventId: candidate.canonicalEventId,
          eventVersionFingerprint: candidate.eventVersionFingerprint,
        },
      ],
      candidates: [candidate],
    };
  }

  return {
    kind: 'SINGLE',
    type: isUpdated ? 'MATERIAL_UPDATE' : 'MATERIAL_NEW',
    title: 'Atlas Invest',
    body: isUpdated
      ? `Atualização importante — ${candidate.ticker}\n${candidate.headline}${provenanceLine}`
      : `${candidate.ticker} — Nova notícia de alta relevância\n${candidate.headline}${provenanceLine}`,
    deepLink: '/today',
    severity: 'HIGH',
    coveredEventKeys: [
      {
        canonicalEventId: candidate.canonicalEventId,
        eventVersionFingerprint: candidate.eventVersionFingerprint,
      },
    ],
    candidates: [candidate],
  };
}

export function buildClientMaterialNewsAlertPayloads(
  candidates: ReadonlyArray<PortfolioNewsAlertCandidateDto>,
): ClientNewsAlertPayload[] {
  if (candidates.length === 0) return [];

  const critical = candidates.filter((c) => c.materiality === 'CRITICAL');
  const nonCritical = candidates.filter((c) => c.materiality !== 'CRITICAL');
  const payloads: ClientNewsAlertPayload[] = [];

  for (const crit of critical) {
    payloads.push(buildSinglePayload(crit));
  }

  if (nonCritical.length === 0) return payloads;

  if (nonCritical.length <= 3) {
    for (const item of nonCritical) {
      payloads.push(buildSinglePayload(item));
    }
    return payloads;
  }

  const uniqueTickers = Array.from(new Set(nonCritical.map((c) => c.ticker)));
  const previewTickers = uniqueTickers.slice(0, 3);
  const remaining = Math.max(0, nonCritical.length - previewTickers.length);
  const tickerLine =
    remaining > 0
      ? `${previewTickers.join(', ')} e mais ${remaining}.`
      : `${previewTickers.join(', ')}.`;

  payloads.push({
    kind: 'BATCH',
    type: 'MATERIAL_BATCH_SUMMARY',
    title: 'Atlas Invest',
    body: `${nonCritical.length} novas notícias relevantes na sua carteira.\n${tickerLine}`,
    deepLink: '/today',
    severity: 'HIGH',
    coveredEventKeys: nonCritical.map((c) => ({
      canonicalEventId: c.canonicalEventId,
      eventVersionFingerprint: c.eventVersionFingerprint,
    })),
    candidates: [...nonCritical],
  });

  return payloads;
}

/**
 * Adapter bridging @atlas/app NotificationService (Tauri or Memory in tests)
 * to the APP-16N delivery contract.
 */
export class DesktopServiceNewsAlertNotifier implements ClientNewsAlertNotifier {
  constructor(private readonly serviceProvider: () => NotificationService = getNotificationService) {}

  async notifyMaterialNews(payload: ClientNewsAlertPayload): Promise<ClientNewsAlertDeliveryResult> {
    const service = this.serviceProvider();
    if (!service.isSupported()) {
      return {
        status: 'NOTIFICATIONS_UNAVAILABLE',
        reason: 'Notifications not supported on this environment',
      };
    }

    const perm = await service.getPermissionState();
    if (perm !== 'granted') {
      return {
        status: 'NOTIFICATIONS_PERMISSION_DENIED',
        reason: `OS notification permission state is '${perm}'`,
      };
    }

    const identity =
      payload.kind === 'BATCH'
        ? `news_batch_${payload.coveredEventKeys.map((k) => k.eventVersionFingerprint.slice(0, 8)).join('_')}`
        : `news_${payload.coveredEventKeys[0]!.canonicalEventId}_${payload.coveredEventKeys[0]!.eventVersionFingerprint.slice(0, 12)}`;

    const notification: LocalNotification = {
      id: identity,
      numericId: stringToNumericId(identity),
      title: payload.title,
      body: payload.body,
      category: 'MATERIAL_NEWS',
      severity: payload.severity,
      deepLink: payload.deepLink,
      createdAt: Date.now(),
    };

    try {
      const ok = await service.send(notification);
      if (!ok) {
        return {
          status: 'DELIVERY_FAILED',
          reason: 'Notification service returned false',
        };
      }
      return { status: 'DELIVERED' };
    } catch (error) {
      return {
        status: 'DELIVERY_FAILED',
        reason: error instanceof Error ? error.message : 'Notification dispatch error',
      };
    }
  }
}

export const DEFAULT_DEFERRED_HIGH_ALERT_MAX_AGE_HOURS = 6;

function resolveCandidateReferenceMs(
  cand: PortfolioNewsAlertCandidateDto,
  ev: PortfolioNewsInboxResponseDto['events'][number] | undefined,
): number {
  const iso =
    cand.state === 'UPDATED'
      ? (ev?.lastObservedAt ?? ev?.firstSeenAt ?? cand.publishedAt)
      : (ev?.firstSeenAt ?? cand.publishedAt);
  return Date.parse(iso);
}

export async function processPortfolioNewsAlerts(params: {
  portfolioId: string;
  userId?: string | null;
  inbox: PortfolioNewsInboxResponseDto;
  preferences: NotificationPreferences;
  ports?: NewsAlertCoordinatorPorts;
  notifier?: ClientNewsAlertNotifier;
  recordInNotificationCenter?: boolean;
  /** Optional clock override for deterministic quiet-hours & deferral window evaluation. */
  now?: Date | number;
  /** Enforces Quiet Hours suppression & deferred-HIGH age window (6h). Defaults to true when `now` is provided. */
  enforceQuietHours?: boolean;
  /** Maximum age in hours for deferred HIGH alerts after Quiet Hours end (default 6h; CRITICAL never expires). */
  deferHighMaxAgeHours?: number;
}): Promise<NewsAlertProcessingDiagnostics> {
  const {
    portfolioId,
    userId,
    inbox,
    preferences,
    ports,
    notifier = new DesktopServiceNewsAlertNotifier(),
    recordInNotificationCenter = true,
  } = params;
  const evalNowDate =
    params.now instanceof Date
      ? params.now
      : typeof params.now === 'number'
        ? new Date(params.now)
        : new Date();
  const evalNowMs = evalNowDate.getTime();
  const shouldEnforceQuietHours = params.enforceQuietHours ?? (params.now !== undefined);
  const deferHighMaxAgeHours = params.deferHighMaxAgeHours ?? DEFAULT_DEFERRED_HIGH_ALERT_MAX_AGE_HOURS;

  return withPortfolioNewsAlertMutex(portfolioId, async () => {
    const rawCandidates = inbox.alertsMeta?.eligibleEvents ?? [];
    const threshold: MaterialNewsAlertThreshold = preferences.materialNewsThreshold ?? 'HIGH_AND_CRITICAL';

    const byThreshold: PortfolioNewsAlertCandidateDto[] = [];
    let suppressedByMateriality = 0;

    for (const c of rawCandidates) {
      if (isCandidateMaterialityEligible(c.materiality, threshold)) {
        byThreshold.push(c);
      } else {
        suppressedByMateriality++;
      }
    }

    // Never retroactively fire for versions observed before alerts were turned ON
    const activatedAtMs = preferences.materialNewsAlertsActivatedAt
      ? Date.parse(preferences.materialNewsAlertsActivatedAt)
      : NaN;

    const eventLookup = new Map(
      inbox.events.map((ev) => [ev.canonicalEventId || ev.id, ev]),
    );

    const eligibleAfterActivation: PortfolioNewsAlertCandidateDto[] = [];
    let suppressedAlreadyDelivered = 0;

    for (const cand of byThreshold) {
      if (Number.isFinite(activatedAtMs)) {
        const ev = eventLookup.get(cand.canonicalEventId);
        const versionIso =
          cand.state === 'NEW'
            ? (ev?.firstSeenAt ?? cand.publishedAt)
            : (ev?.lastObservedAt ?? ev?.firstSeenAt ?? cand.publishedAt);
        const versionMs = Date.parse(versionIso);
        if (Number.isFinite(versionMs) && versionMs <= activatedAtMs) {
          suppressedAlreadyDelivered++;
          continue;
        }
      }
      eligibleAfterActivation.push(cand);
    }

    const suppressedMetrics = inbox.events.filter(
      (e) =>
        (e.state === 'NEW' || e.state === 'UPDATED') &&
        !isCandidateMaterialityEligible(e.materiality ?? 'MEDIUM', threshold),
    ).length;

    const totalSuppressedByMateriality = Math.max(suppressedByMateriality, suppressedMetrics);

    if (eligibleAfterActivation.length === 0) {
      return {
        eligibleAlerts: 0,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'NO_ELIGIBLE_EVENTS',
      };
    }

    if (!preferences.enabled || !preferences.materialNewsAlerts) {
      if (ports) {
        try {
          await ports.suppressBaseline(
            portfolioId,
            eligibleAfterActivation.map((c) => ({
              canonicalEventId: c.canonicalEventId,
              eventVersionFingerprint: c.eventVersionFingerprint,
            })),
          );
        } catch {
          // Non-fatal: alerts stay disabled and inbox remains intact
        }
      }

      return {
        eligibleAlerts: eligibleAfterActivation.length,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'DISABLED',
      };
    }

    // Fail-closed pre-flight check before claiming in Postgres when using default OS service
    if (!params.notifier && !getNotificationService().isSupported()) {
      return {
        eligibleAlerts: eligibleAfterActivation.length,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'NOTIFICATIONS_UNAVAILABLE',
      };
    }

    // APP-16P Quiet Hours Policy:
    // Refresh continues cleanly in the background while atlas-app.exe is active,
    // but OS alerts (both HIGH and CRITICAL — no sound bypass) are paused during Quiet Hours.
    // Claims are NOT acquired while suppressed so CRITICAL and recent HIGH (<= 6h) retain eligibility once Quiet Hours end.
    if (shouldEnforceQuietHours && isInQuietHours(preferences, evalNowDate)) {
      return {
        eligibleAlerts: eligibleAfterActivation.length,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'SUPPRESSED_QUIET_HOURS',
      };
    }

    // APP-16P Post-Quiet-Hours Anti-Avalanche Policy:
    // CRITICAL retains eligibility regardless of overnight delay.
    // HIGH remains alert-eligible only while still recent (<= 6h); older accumulated HIGHs are baseline-suppressed without popup flood.
    let activeEligibleCandidates = eligibleAfterActivation;
    if (shouldEnforceQuietHours && deferHighMaxAgeHours > 0) {
      const maxAgeMs = deferHighMaxAgeHours * 60 * 60 * 1000;
      const freshOrCritical: PortfolioNewsAlertCandidateDto[] = [];
      const staleNonCritical: PortfolioNewsAlertCandidateDto[] = [];

      for (const cand of eligibleAfterActivation) {
        if (cand.materiality === 'CRITICAL') {
          freshOrCritical.push(cand);
          continue;
        }
        const refMs = resolveCandidateReferenceMs(cand, eventLookup.get(cand.canonicalEventId));
        if (Number.isFinite(refMs) && evalNowMs - refMs > maxAgeMs) {
          staleNonCritical.push(cand);
        } else {
          freshOrCritical.push(cand);
        }
      }

      if (staleNonCritical.length > 0) {
        suppressedAlreadyDelivered += staleNonCritical.length;
        if (ports) {
          try {
            await ports.suppressBaseline(
              portfolioId,
              staleNonCritical.map((c) => ({
                canonicalEventId: c.canonicalEventId,
                eventVersionFingerprint: c.eventVersionFingerprint,
              })),
            );
          } catch {
            // Non-blocking: inbox remains authoritative even if baseline suppression fails
          }
        }
      }

      activeEligibleCandidates = freshOrCritical;
      if (activeEligibleCandidates.length === 0) {
        return {
          eligibleAlerts: 0,
          deliveredAlerts: 0,
          suppressedAlreadyDelivered,
          suppressedByMateriality: totalSuppressedByMateriality,
          notificationStatus: 'NO_ELIGIBLE_EVENTS',
        };
      }
    }

    let claimedCandidates = activeEligibleCandidates;
    if (ports) {
      const claimed = await ports.claimPendingAlerts(
        portfolioId,
        activeEligibleCandidates.map((c) => ({
          canonicalEventId: c.canonicalEventId,
          eventVersionFingerprint: c.eventVersionFingerprint,
        })),
      );
      const claimedSet = new Set(
        claimed.map((k) => `${k.canonicalEventId}::${k.eventVersionFingerprint}`),
      );
      claimedCandidates = activeEligibleCandidates.filter((c) =>
        claimedSet.has(`${c.canonicalEventId}::${c.eventVersionFingerprint}`),
      );
      suppressedAlreadyDelivered += activeEligibleCandidates.length - claimedCandidates.length;

      if (claimedCandidates.length === 0) {
        return {
          eligibleAlerts: 0,
          deliveredAlerts: 0,
          suppressedAlreadyDelivered,
          suppressedByMateriality: totalSuppressedByMateriality,
          notificationStatus: 'NO_ELIGIBLE_EVENTS',
        };
      }
    }

    const claimedAt = new Date().toISOString();
    const payloads = buildClientMaterialNewsAlertPayloads(claimedCandidates);
    const deliveredAuditItems: PortfolioNewsAlertAuditItemDto[] = [];
    const failedAuditItems: PortfolioNewsAlertAuditItemDto[] = [];
    let lastAttemptId: string | undefined;
    let lastDeliveredNotifId: string | null = null;
    let lastFailureStatus: Exclude<PortfolioNewsAlertHistoryStatusDto, 'DELIVERED'> | undefined;
    let lastFailureReason: string | null = null;
    let finalStatus: ClientNewsAlertDeliveryStatus = 'DELIVERY_FAILED';

    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i]!;
      const alertAttemptId = createAttemptUuid();
      lastAttemptId = alertAttemptId;
      const attemptedAt = new Date().toISOString();
      const histId =
        payload.kind === 'BATCH'
          ? `news_batch_${payload.coveredEventKeys.map((k) => k.eventVersionFingerprint.slice(0, 8)).join('_')}`
          : `news_${payload.coveredEventKeys[0]!.canonicalEventId}_${payload.coveredEventKeys[0]!.eventVersionFingerprint.slice(0, 12)}`;

      let res: ClientNewsAlertDeliveryResult;
      try {
        res = await notifier.notifyMaterialNews(payload);
      } catch (err) {
        res = {
          status: 'DELIVERY_FAILED',
          reason: err instanceof Error ? err.message : 'Notification dispatch threw error',
        };
      }

      if (res.status === 'DELIVERED') {
        lastDeliveredNotifId = histId;
        deliveredAuditItems.push(
          ...buildClientAuditItems({
            payload,
            alertAttemptId,
            attemptedAt,
            claimedAt,
            deliveryStatus: 'DELIVERED',
            notificationId: histId,
          }),
        );
        finalStatus = 'DELIVERED';

        if (recordInNotificationCenter && userId) {
          notificationCenter.addNotification(userId, {
            id: histId,
            title: payload.title,
            body: payload.body,
            category: 'MATERIAL_NEWS',
            severity: payload.severity,
            deepLink: payload.deepLink,
            createdAt: Date.now(),
          });
        }
      } else {
        const mappedStatus = mapClientStatusToHistoryStatus(res.status);
        const cleanReason = sanitizeClientFailureReason(res.reason);
        lastFailureStatus = mappedStatus;
        lastFailureReason = cleanReason;
        failedAuditItems.push(
          ...buildClientAuditItems({
            payload,
            alertAttemptId,
            attemptedAt,
            claimedAt,
            deliveryStatus: mappedStatus,
            failureReason: cleanReason,
          }),
        );
        if (deliveredAuditItems.length === 0) {
          finalStatus = res.status;
        }
        if (
          res.status === 'NOTIFICATIONS_PERMISSION_DENIED' ||
          res.status === 'NOTIFICATIONS_UNSUPPORTED' ||
          res.status === 'NOTIFICATIONS_UNAVAILABLE'
        ) {
          for (let j = i + 1; j < payloads.length; j++) {
            failedAuditItems.push(
              ...buildClientAuditItems({
                payload: payloads[j]!,
                alertAttemptId: createAttemptUuid(),
                attemptedAt,
                claimedAt,
                deliveryStatus: mappedStatus,
                failureReason: cleanReason,
              }),
            );
          }
          break;
        }
      }
    }

    if (ports) {
      if (deliveredAuditItems.length > 0) {
        await ports.confirmAlertsDelivered(portfolioId, deliveredAuditItems, {
          alertAttemptId: lastAttemptId,
          notificationId: lastDeliveredNotifId,
        });
      }
      if (failedAuditItems.length > 0) {
        await ports.releaseAlertsClaim(portfolioId, failedAuditItems, {
          deliveryStatus: lastFailureStatus,
          failureReason: lastFailureReason,
          attemptedAt: new Date().toISOString(),
          alertAttemptId: lastAttemptId,
          recordHistory: true,
        });
      }
    }

    const diagnostics: NewsAlertProcessingDiagnostics = {
      eligibleAlerts: claimedCandidates.length,
      deliveredAlerts: deliveredAuditItems.length,
      suppressedAlreadyDelivered,
      suppressedByMateriality: totalSuppressedByMateriality,
      notificationStatus: deliveredAuditItems.length > 0 ? 'DELIVERED' : finalStatus,
    };

    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.info('[APP-16N][NewsAlerts]', diagnostics);
    }

    return diagnostics;
  });
}
